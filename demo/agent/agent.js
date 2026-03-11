/**
 * Kova Demo AI Agent — Escrow x402 Autonomous Payments
 *
 * This agent uses the escrow pattern for autonomous payments:
 * 1. Discovers X402 services (gets pricing info)
 * 2. Validates rules via validate-spend (read-only, on-chain)
 * 3. Calls agent-pay on the escrow contract (atomic: transfer + log)
 *    - Contract transfers STX from escrow to service
 *    - No user interaction needed after initial deposit
 * 4. Calls service API for data (service sees payment on-chain)
 *
 * Key management (hackathon):
 *   Master mnemonic in .env, HD derivation per account index
 *   Production: wrap seed in AWS KMS / GCP KMS / HSM
 *
 * Scheduling modes (set SCHEDULE_MODE in .env):
 *   once     — run one service, then exit (default)
 *   interval — run all services every SCHEDULE_INTERVAL minutes
 *   pipeline — execute a multi-step pipeline from JSON file
 *
 * Data delivery (set DELIVERY_MODE in .env):
 *   off      — just log to terminal (default)
 *   webhook  — POST results to WEBHOOK_URL
 *   api      — serve latest results at http://localhost:AGENT_API_PORT
 *   both     — webhook + api combined
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your values
 *   2. Start the X402 service: cd ../x402-service && npm start
 *   3. Run: node agent.js
 */

import "dotenv/config";
import fs from "fs";
import express from "express";
import cors from "cors";
import axios from "axios";
import stxTx from "@stacks/transactions";
const {
    makeContractCall,
    broadcastTransaction,
    standardPrincipalCV,
    uintCV,
    AnchorMode,
    PostConditionMode,
    getAddressFromPrivateKey,
    fetchCallReadOnlyFunction,
    cvToJSON,
} = stxTx;
import walletSdk from "@stacks/wallet-sdk";
const { generateWallet, generateNewAccount } = walletSdk;
import stxNetwork from "@stacks/network";
const { STACKS_TESTNET } = stxNetwork;
import { initBot, requestApproval, notify, isBotActive } from "./bot.js";

// --- validate-spend: pre-flight check before agent-pay ---
async function validateSpend(serviceAddress, amount) {
    console.log(`   Validating spend rules on-chain...`);
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress: CONTRACT,
            contractName: "agent-wallet",
            functionName: "validate-spend",
            functionArgs: [
                standardPrincipalCV(OWNER),
                standardPrincipalCV(serviceAddress),
                uintCV(amount),
            ],
            network: STACKS_TESTNET,
            senderAddress: agentAddress,
        });
        const json = cvToJSON(result);
        if (json.success) {
            console.log(`   Rules check: PASSED\n`);
            return true;
        } else {
            console.log(`   Rules check: FAILED - ${JSON.stringify(json)}\n`);
            return false;
        }
    } catch (err) {
        console.error(`   Rules check error: ${err.message}\n`);
        return false;
    }
}

// --- agent-pay: autonomous escrow payment (atomic transfer + log) ---
async function agentPay(serviceAddress, amount) {
    console.log(`   Executing agent-pay on escrow contract...`);
    try {
        const txOptions = {
            contractAddress: CONTRACT,
            contractName: "agent-wallet",
            functionName: "agent-pay",
            functionArgs: [
                standardPrincipalCV(OWNER),
                standardPrincipalCV(serviceAddress),
                uintCV(amount),
            ],
            senderKey: AGENT_KEY,
            network: STACKS_TESTNET,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 5000n,
        };
        const tx = await makeContractCall(txOptions);
        const broadcastResult = await broadcastTransaction({ transaction: tx, network: STACKS_TESTNET });
        if (broadcastResult.error) {
            console.error(`   agent-pay broadcast failed: ${broadcastResult.error}`);
            return null;
        }
        console.log(`   agent-pay tx: 0x${broadcastResult.txid}\n`);
        return `0x${broadcastResult.txid}`;
    } catch (err) {
        console.error(`   agent-pay error: ${err.message}\n`);
        return null;
    }
}

// ─── Derive private key from mnemonic or use raw key ─
async function getAgentKey() {
    const mnemonic = process.env.AGENT_MNEMONIC;
    const rawKey = process.env.AGENT_PRIVATE_KEY;

    if (mnemonic) {
        const accountIndex = parseInt(process.env.AGENT_ACCOUNT_INDEX || "0");
        console.log(`🔑 Deriving key from mnemonic (account index: ${accountIndex})...`);

        let wallet = await generateWallet({
            secretKey: mnemonic,
            password: "",
        });

        while (wallet.accounts.length <= accountIndex) {
            wallet = generateNewAccount(wallet);
        }

        const account = wallet.accounts[accountIndex];
        const privateKey = account.stxPrivateKey;
        console.log(`   ✅ Key derived successfully\n`);
        return privateKey;
    }

    if (rawKey) {
        return rawKey;
    }

    console.error("❌ Set either AGENT_MNEMONIC or AGENT_PRIVATE_KEY in .env");
    console.error("   AGENT_MNEMONIC = your 24-word seed phrase from Hiro Wallet");
    console.error("   AGENT_PRIVATE_KEY = raw hex private key");
    process.exit(1);
}

// ─── Config ──────────────────────────────────────────
const AGENT_KEY = await getAgentKey();
const OWNER = process.env.OWNER_ADDRESS;
const CONTRACT = process.env.CONTRACT_ADDRESS || OWNER;
const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:3402";

// Scheduler config
const SCHEDULE_MODE = process.env.SCHEDULE_MODE || "once"; // once | interval | pipeline
const SCHEDULE_INTERVAL = parseInt(process.env.SCHEDULE_INTERVAL || "5"); // minutes
const SERVICE_ENDPOINTS = (process.env.SERVICE_ENDPOINTS || "/api/price-feed")
    .split(",")
    .map(s => s.trim());

// Pipeline config
const PIPELINE_FILE = process.env.PIPELINE_FILE || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

// Data delivery config
const DELIVERY_MODE = process.env.DELIVERY_MODE || "off"; // off | webhook | api | both
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const AGENT_API_PORT = parseInt(process.env.AGENT_API_PORT || "4000");

// In-memory store for latest results (served by API)
let latestResults = { timestamp: null, services: {}, runs: 0 };

if (!OWNER) {
    console.error("❌ Missing OWNER_ADDRESS in .env");
    process.exit(1);
}

// Use network object for v7 API
const agentAddress = getAddressFromPrivateKey(AGENT_KEY, STACKS_TESTNET);

console.log(`
╔══════════════════════════════════════════════════════╗
║           🤖 Kova AI Agent v3.0 (Escrow)             ║
╠══════════════════════════════════════════════════════╣
║  Agent:   ${agentAddress}  ║
║  Owner:   ${OWNER}  ║
║  Service: ${SERVICE_URL.padEnd(39)}║
║  Mode:    Escrow (autonomous agent-pay)              ║
╚══════════════════════════════════════════════════════╝
`);

// ─── Initialize Telegram Bot ─────────────────────────
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const botChatId = process.env.TELEGRAM_CHAT_ID;
const botThreshold = parseFloat(process.env.APPROVAL_THRESHOLD_STX || "0.05");
if (botToken) {
    initBot(botToken, botChatId, botThreshold);
} else {
    console.log("📱 Telegram bot: disabled (no TELEGRAM_BOT_TOKEN in .env)\n");
}

// ─── Step 1: Discover services ──────────────────────
async function discoverServices() {
    console.log("🔍 Step 1: Discovering X402 services...\n");

    try {
        const resp = await fetch(`${SERVICE_URL}/.well-known/x402`);
        const discovery = await resp.json();

        console.log(`   Found ${discovery.services.length} services:`);
        discovery.services.forEach((s) => {
            console.log(`   • ${s.name} — ${s.priceSTX} STX`);
        });
        console.log(`   Service address: ${discovery.address}\n`);

        return discovery;
    } catch (err) {
        console.error("   ❌ Cannot reach service. Is it running?");
        console.error(`   Start it with: cd ../x402-service && npm start\n`);
        process.exit(1);
    }
}

// ─── Run a single service endpoint (escrow flow) ─────
async function runService(endpoint) {
    console.log(`\n─── Service: ${endpoint} ───\n`);

    // 1. Discover service to get pricing info
    let discovery;
    try {
        const resp = await fetch(`${SERVICE_URL}/.well-known/x402`);
        discovery = await resp.json();
    } catch {
        console.log(`   ⚠️ Can't reach service discovery`);
        return null;
    }

    const serviceName = endpoint.replace("/api/", "");
    const serviceInfo = discovery.services?.find(s => s.name === serviceName);
    const price = serviceInfo ? serviceInfo.price : 500_000;
    const serviceAddress = discovery.address;

    console.log(`   💰 Price: ${(price / 1_000_000).toFixed(4)} STX`);
    console.log(`   📋 Service: ${serviceAddress}\n`);

    // 2. Request approval via Telegram (if bot is active)
    const amountSTX = price / 1_000_000;
    if (isBotActive()) {
        console.log(`\n📱 Checking approval (${amountSTX} STX)...\n`);
        const approved = await requestApproval(
            price,
            serviceName || endpoint,
            serviceAddress
        );
        if (!approved) {
            console.log("   ❌ Payment rejected by owner via Telegram\n");
            notify(`❌ Agent payment for \`${endpoint}\` was *rejected*.`);
            return null;
        }
        console.log(`   ✅ Approved!\n`);
    }

    // 3. Validate rules on-chain BEFORE paying
    console.log(`📜 Step 2: Validating rules on-chain...\n`);
    const valid = await validateSpend(serviceAddress, price);
    if (!valid) {
        console.log(`   Kill switch active, service not allowed, or limits exceeded`);
        notify(`Block Agent payment for \`${endpoint}\` - *rules check failed*.`);
        return null;
    }

    // 4. Execute agent-pay on escrow contract (autonomous!)
    console.log(`💳 Step 3: Executing agent-pay from escrow...\n`);
    console.log(`   Agent signs contract-call → escrow transfers STX → service receives payment\n`);
    const txId = await agentPay(serviceAddress, price);
    if (!txId) {
        console.log(`   ❌ agent-pay failed — check balance or limits`);
        notify(`❌ Payment *failed* for \`${endpoint}\`: agent-pay failed`);
        return null;
    }

    // 5. Call service for data (payment already happened on-chain)
    console.log(`📡 Step 4: Fetching data from service...\n`);
    try {
        const response = await axios.get(`${SERVICE_URL}${endpoint}`);
        const data = response.data;

        console.log(`   ✅ Data received!\n`);
        console.log(`   ┌─────────────────────────────────────────┐`);
        console.log(`   │ Response:                               │`);
        console.log(`   ├─────────────────────────────────────────┤`);
        Object.entries(data).forEach(([key, val]) => {
            const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
            console.log(`   │ ${key}: ${valStr.substring(0, 40)}`);
        });
        console.log(`   └─────────────────────────────────────────┘\n`);

        console.log(`   Payment: ${txId}`);
        console.log(`   Paid from escrow: ${amountSTX.toFixed(4)} STX\n`);

        notify([
            `✅ *Paid for ${endpoint}*`,
            `Amount: *${amountSTX.toFixed(4)} STX*`,
            `TxID: \`${txId.toString().slice(0, 10)}...\``,
            `Method: Escrow agent-pay (autonomous)`,
        ].join("\n"));

        return data;
    } catch (err) {
        console.error(`   ❌ Service call failed: ${err.message}\n`);
        // Payment already went through, but service didn't return data
        console.log(`   Note: Payment was made on-chain (tx: ${txId})`);
        console.log(`   The service may need time to process. Data fetch failed.\n`);
        notify(`⚠️ Paid for \`${endpoint}\` (tx: ${txId}) but data fetch failed: ${err.message}`);
        return null;
    }
}

// ─── Run all configured services ────────────────────
async function runAllServices() {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  🚀 Agent Run — ${timestamp}`);
    console.log(`  Services: ${SERVICE_ENDPOINTS.join(", ")}`);
    console.log(`═══════════════════════════════════════════════════`);

    // Discover services
    await discoverServices();

    // Run each service in sequence
    const results = {};
    for (const endpoint of SERVICE_ENDPOINTS) {
        const data = await runService(endpoint);
        if (data) {
            results[endpoint] = data;
        }
    }

    const successCount = Object.keys(results).length;
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  ✅ Run complete — ${successCount}/${SERVICE_ENDPOINTS.length} services paid`);
    console.log(`═══════════════════════════════════════════════════\n`);

    // ─── Deliver results ────────────────────────────
    latestResults = {
        timestamp: new Date().toISOString(),
        services: results,
        runs: latestResults.runs + 1,
        agent: agentAddress,
        owner: OWNER,
    };

    // Webhook delivery
    if ((DELIVERY_MODE === "webhook" || DELIVERY_MODE === "both") && WEBHOOK_URL) {
        try {
            await fetch(WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(latestResults),
            });
            console.log(`  📤 Webhook delivered → ${WEBHOOK_URL}`);
        } catch (err) {
            console.error(`  ❌ Webhook failed: ${err.message}`);
        }
    }

    return results;
}

// ─── API Server (optional) ──────────────────────────
function startApiServer() {
    const apiServer = express();
    apiServer.use(cors());

    apiServer.get("/api/latest", (req, res) => {
        res.json(latestResults);
    });

    apiServer.get("/api/health", (req, res) => {
        res.json({
            status: "ok",
            agent: agentAddress,
            mode: SCHEDULE_MODE,
            interval: SCHEDULE_INTERVAL,
            services: SERVICE_ENDPOINTS,
            delivery: DELIVERY_MODE,
            totalRuns: latestResults.runs,
        });
    });

    apiServer.listen(AGENT_API_PORT, () => {
        console.log(`  🌐 Agent API running → http://localhost:${AGENT_API_PORT}/api/latest`);
        console.log(`  💡 Any app can fetch latest results from this URL\n`);
    });
}

// ─── Main: Scheduler ────────────────────────────────
async function main() {
    console.log(`\n📋 Schedule mode: ${SCHEDULE_MODE}`);
    if (SCHEDULE_MODE === "interval") {
        console.log(`⏱️  Interval: every ${SCHEDULE_INTERVAL} minute(s)`);
    }
    console.log(`📡 Endpoints: ${SERVICE_ENDPOINTS.join(", ")}`);
    console.log(`📤 Delivery: ${DELIVERY_MODE}${DELIVERY_MODE === "webhook" || DELIVERY_MODE === "both" ? ` → ${WEBHOOK_URL}` : ""}\n`);

    // Start API server if enabled
    if (DELIVERY_MODE === "api" || DELIVERY_MODE === "both") {
        startApiServer();
    }

    if (SCHEDULE_MODE === "once") {
        // ─── One-shot mode ───
        await runAllServices();

        if (isBotActive() || DELIVERY_MODE === "api" || DELIVERY_MODE === "both") {
            console.log("📱 Agent is running. Press Ctrl+C to stop.\n");
        } else {
            process.exit(0);
        }

    } else if (SCHEDULE_MODE === "interval") {
        // ─── Loop mode: run every X minutes ───
        console.log(`🔄 Agent will run every ${SCHEDULE_INTERVAL} minute(s). Press Ctrl+C to stop.\n`);

        // Run immediately on start
        await runAllServices();

        // Then schedule
        const intervalMs = SCHEDULE_INTERVAL * 60 * 1000;
        setInterval(async () => {
            try {
                await runAllServices();
            } catch (err) {
                console.error(`❌ Scheduled run error: ${err.message}`);
                notify(`❌ Scheduled agent run *failed*: ${err.message}`);
            }
        }, intervalMs);

    } else if (SCHEDULE_MODE === "pipeline") {
        // ─── Pipeline mode: execute multi-step workflow ───
        if (!PIPELINE_FILE) {
            console.error("❌ PIPELINE_FILE not set. Point to a pipeline JSON file.");
            process.exit(1);
        }
        if (!fs.existsSync(PIPELINE_FILE)) {
            console.error(`❌ Pipeline file not found: ${PIPELINE_FILE}`);
            process.exit(1);
        }

        const pipeline = JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf-8"));
        console.log(`\n🔗 Pipeline: ${pipeline.name}`);
        console.log(`   Steps: ${pipeline.steps.length}`);
        console.log(`   Delivery: ${pipeline.delivery || "terminal"}\n`);

        const results = await runPipeline(pipeline);

        // Deliver results
        if (pipeline.delivery === "webhook" && pipeline.webhookUrl) {
            try {
                await fetch(pipeline.webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(results),
                });
                console.log(`📤 Pipeline results delivered → ${pipeline.webhookUrl}`);
            } catch (err) {
                console.error(`❌ Webhook failed: ${err.message}`);
            }
        }

        if (isBotActive()) {
            console.log("📱 Agent is running. Press Ctrl+C to stop.\n");
        } else {
            process.exit(0);
        }

    } else {
        console.error(`❌ Unknown SCHEDULE_MODE: ${SCHEDULE_MODE}`);
        console.error(`   Valid modes: once, interval, pipeline`);
        process.exit(1);
    }
}

// ─── Pipeline Executor ──────────────────────────────
async function runPipeline(pipeline) {
    const stepResults = {};
    const results = {
        pipeline: pipeline.name,
        timestamp: new Date().toISOString(),
        steps: [],
        agent: agentAddress,
        owner: OWNER,
    };

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  🔗 Pipeline: ${pipeline.name}`);
    console.log(`═══════════════════════════════════════════════════`);

    for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        const stepNum = i + 1;

        console.log(`\n─── Step ${stepNum}/${pipeline.steps.length}: ${step.service || step.type} ───\n`);

        // Check condition
        if (step.condition) {
            const depResult = stepResults[step.condition.dependsOn];
            if (!depResult) {
                console.log(`   ⚠️ Skipped — depends on ${step.condition.dependsOn} which has no result`);
                results.steps.push({ step: stepNum, type: step.type, status: "skipped", reason: "missing dependency" });
                continue;
            }
            const conditionMet = evaluateCondition(depResult, step.condition);
            if (!conditionMet) {
                console.log(`   ⚠️ Skipped — condition not met: ${step.condition.field} ${step.condition.operator} ${step.condition.value}`);
                results.steps.push({ step: stepNum, type: step.type, status: "skipped", reason: "condition not met" });
                continue;
            }
            console.log(`   ✅ Condition met: ${step.condition.field} ${step.condition.operator} ${step.condition.value}`);
        }

        if (step.type === "x402-service") {
            // ─── x402 Service Step (via escrow agent-pay) ───
            const serviceAddr = step.serviceAddress;
            const price = step.maxPrice || 500000;

            // Validate on-chain rules
            const valid = await validateSpend(serviceAddr, price);
            if (!valid) {
                console.log(`   ❌ Rules check failed for ${step.service}`);
                results.steps.push({ step: stepNum, type: step.type, status: "blocked", reason: "rules check failed" });
                continue;
            }

            // Execute agent-pay from escrow
            const txId = await agentPay(serviceAddr, price);
            if (!txId) {
                console.log(`   ❌ agent-pay failed for ${step.service}`);
                results.steps.push({ step: stepNum, type: step.type, status: "failed", reason: "agent-pay failed" });
                continue;
            }

            // Fetch data from service
            try {
                const response = await axios.get(step.url);
                const data = response.data;

                console.log(`   ✅ Data received from ${step.service}`);
                stepResults[step.id] = data;
                results.steps.push({ step: stepNum, type: step.type, service: step.service, status: "success", data, txId });
            } catch (err) {
                console.error(`   ❌ Data fetch failed (payment already made): ${err.message}`);
                results.steps.push({ step: stepNum, type: step.type, service: step.service, status: "partial", txId, error: err.message });
            }

        } else if (step.type === "llm-analysis") {
            // ─── LLM Analysis Step ───
            console.log(`   🧠 Running LLM analysis...`);
            const apiKey = step.llmApiKey || OPENROUTER_API_KEY;
            if (!apiKey) {
                console.log(`   ❌ No OpenRouter API key — set OPENROUTER_API_KEY in .env or in pipeline`);
                results.steps.push({ step: stepNum, type: step.type, status: "failed", error: "no API key" });
                continue;
            }

            try {
                const analysis = await callLLM({
                    apiKey,
                    model: step.llmModel || "google/gemini-2.0-flash-exp:free",
                    prompt: step.llmPrompt || "Analyze the data.",
                    context: stepResults,
                });

                console.log(`   ✅ LLM analysis complete`);
                console.log(`   ┌─────────────────────────────────────────┐`);
                console.log(`   │ ${analysis.slice(0, 80)}`);
                if (analysis.length > 80) console.log(`   │ ${analysis.slice(80, 160)}`);
                console.log(`   └─────────────────────────────────────────┘\n`);

                stepResults[step.id] = { analysis };
                results.steps.push({ step: stepNum, type: step.type, status: "success", analysis });

            } catch (err) {
                console.error(`   ❌ LLM call failed: ${err.message}`);
                results.steps.push({ step: stepNum, type: step.type, status: "failed", error: err.message });
            }
        }
    }

    const successCount = results.steps.filter(s => s.status === "success").length;
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  ✅ Pipeline complete — ${successCount}/${pipeline.steps.length} steps succeeded`);
    console.log(`═══════════════════════════════════════════════════\n`);

    notify([
        `🔗 *Pipeline: ${pipeline.name}*`,
        `Steps: ${successCount}/${pipeline.steps.length} succeeded`,
    ].join("\n"));

    return results;
}

// ─── LLM Call (OpenRouter) ──────────────────────────
async function callLLM({ apiKey, model, prompt, context }) {
    const contextStr = Object.entries(context)
        .map(([id, data]) => `[${id}]: ${JSON.stringify(data, null, 2)}`)
        .join("\n\n");

    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
        model,
        messages: [
            {
                role: "system",
                content: "You are a data analysis agent for Kova. Analyze the provided data from multiple services and give a clear, actionable recommendation. Be concise — max 3 sentences.",
            },
            {
                role: "user",
                content: `${prompt}\n\n--- Data from previous steps ---\n${contextStr}`,
            },
        ],
        max_tokens: 300,
    }, {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://kova.app",
            "X-Title": "Kova Agent",
        },
    });

    return response.data.choices?.[0]?.message?.content || "No analysis generated.";
}

// ─── Condition Evaluator ────────────────────────────
function evaluateCondition(data, condition) {
    try {
        const value = condition.field.split(".").reduce((obj, key) => obj?.[key], data);
        const target = isNaN(condition.value) ? condition.value : parseFloat(condition.value);
        const actual = typeof value === "string" && !isNaN(value) ? parseFloat(value) : value;

        switch (condition.operator) {
            case ">": return actual > target;
            case "<": return actual < target;
            case "==": return actual == target;
            case "!=": return actual != target;
            case "contains": return String(actual).includes(String(target));
            default: return false;
        }
    } catch {
        return false;
    }
}

main().catch(console.error);
