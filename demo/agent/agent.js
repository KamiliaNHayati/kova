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
    TransactionVersion,
    publicKeyToAddress,  
} = stxTx;
import walletSdk from "@stacks/wallet-sdk";
const { generateWallet, generateNewAccount } = walletSdk;
import stxNetwork from "@stacks/network";
const { STACKS_TESTNET } = stxNetwork;
import stxEnc from "@stacks/encryption";
const { verifyMessageSignatureRsv} = stxEnc;
import { initBot, requestApproval, notify, isBotActive, setOnChatIdRegistered } from "./bot.js";

// ─── State Persistence ───────────────────────────────
const STATE_FILE = "kova_state.json";
let appState = {
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || null,
        chatId: process.env.TELEGRAM_CHAT_ID || null,
        thresholdSTX: parseFloat(process.env.APPROVAL_THRESHOLD_STX || "0.05")
    }
};

// ─── Agent Key Manager (custodial) ──────────────────
// Tracks derived agents from the mnemonic.
// Production: replace with KMS API.
const derivedAgents = [];
let nextAgentIndex = 0;

function saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        ...appState,
        derivedAgents: derivedAgents.map(a => ({ address: a.address, index: a.index, label: a.label }))
    }, null, 2));
}

// ✅ NOW register callback — appState and saveState are defined
setOnChatIdRegistered((id) => {
    appState.telegram.chatId = id;
    saveState();
    console.log(`💾 Chat ID auto-saved: ${id}`);
});

const CONTRACT_NAME = "agent-wallet-v7";

// After loading state, restore derivedAgents
if (fs.existsSync(STATE_FILE)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
        appState = { ...appState, ...loaded };
        // Restore derived agents
        if (loaded.derivedAgents && Array.isArray(loaded.derivedAgents)) {
            for (const a of loaded.derivedAgents) {
                if (!derivedAgents.find(d => d.address === a.address)) {
                    derivedAgents.push(a);
                }
            }
        }
        console.log("💾 Loaded state from kova_state.json");
    } catch (e) {
        console.error("⚠️ Failed to load state:", e.message);
    }
}

// --- validate-spend: pre-flight check before agent-pay ---
// v3 operator model: explicit agent param in function args
async function validateSpend(serviceAddress, amount, owner, agent) {
    const functionArgs = [
        standardPrincipalCV(owner),
        standardPrincipalCV(agent),
        standardPrincipalCV(serviceAddress),
        uintCV(amount),
    ];
    try {
        const result = await fetchCallReadOnlyFunction({
            contractAddress: CONTRACT,
            contractName: CONTRACT_NAME,
            functionName: "validate-spend",
            functionArgs,
            network: STACKS_TESTNET,
            senderAddress: operatorAddress,
        });
        const json = cvToJSON(result);
        if (json.success) {
            console.log(`   Rules check: PASSED\n`);
            return true;
        } else {
            console.log(`   Rules check: FAILED - ${JSON.stringify(json)}\n`);
            
            const errCode = json.value?.value;
            if (errCode === "103") {
                console.log(`   ❌ ERR-NO-WALLET (103): This agent has no wallet!`);
                console.log(`      👉 You must create a wallet + deposit STX using the 'Wallet Setup' tab in the UI first.`);
            } else if (errCode === "108") {
                console.log(`   ❌ ERR-SERVICE-NOT-ALLOWED (108): Service not on this agent's allowlist.`);
                console.log(`      👉 Go to Settings or Services in the UI and allow this service for this agent.`);
            } else if (errCode === "104") {
                console.log(`   ❌ ERR-INSUFFICIENT-BALANCE (104): Agent escrow is out of funds.`);
            } else if (errCode === "118") {
                console.log(`   ❌ ERR-NOT-AUTHORIZED (118): Operator not registered for this owner.`);
                console.log(`      👉 Owner must call register-operator with the operator address first.`);
            } else {
                console.log(`   ❌ Kill switch active or limits exceeded.`);
            }
            return false;
        }
    } catch (err) {
        console.error(`   ❌ Failed: ${err.message}\n`);
        return false;
    }
}

// --- agent-pay: operator-signed escrow payment (atomic transfer + log + fee) ---
// v3 operator model: operator signs and pays gas, 4-param signature
async function agentPay(serviceAddress, amount, owner, agent)  {
    console.log(`   Executing agent-pay (operator-signed) on escrow contract...`);
    console.log(`   Operator signs → escrow transfers STX → service + platform fee\n`);
    const functionArgs = [
        standardPrincipalCV(owner),
        standardPrincipalCV(agent),
        standardPrincipalCV(serviceAddress),
        uintCV(amount),
    ];
    try {
        const txOptions = {
            contractAddress: CONTRACT,
            contractName: CONTRACT_NAME,
            functionName: "agent-pay",
            functionArgs,
            senderKey: OPERATOR_KEY,
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
        const txid = broadcastResult.txid;
        console.log(`   agent-pay tx: 0x${txid}\n`);
        const waitRes = await pollTxStatus(txid, 100_000, 3000);
        if (!waitRes.ok && !waitRes.timeout) {
            console.error(`   ❌ Tx aborted on-chain — skipping service call`);
            return null;
        }
        return `0x${txid}`;
    } catch (err) {
        console.error(`   agent-pay error: ${err.message}\n`);
        return null;
    }
}

async function pollTxStatus(txid, maxMs = 60_000, intervalMs = 2000) {
  const base = "https://stacks-node-api.testnet.stacks.co/extended/v1/tx";
  const start = Date.now();
  console.log(`   ⏳ Polling tx status: ${txid}`);
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${base}/${txid}`);
      if (res.status === 200) {
        const json = await res.json();
        if (json.tx_status === "success") {
          console.log(`   ✅ Tx confirmed on-chain\n`);
          return { ok: true, json };
        }
        if (json.tx_status === "abort_by_response" || json.tx_status === "failed") {
          console.log(`   ❌ Tx failed on-chain: ${json.tx_status}\n`);
          return { ok: false, json };
        }
        console.log(`   ⏳ Status: ${json.tx_status} — waiting...`);
      }
      // 404 = not propagated yet, keep waiting
    } catch (e) { /* ignore transient errors */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log(`   ⚠️ Tx not confirmed within ${maxMs/1000}s — continuing anyway\n`);
  return { ok: false, timeout: true };
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
let AGENT_KEY = await getAgentKey();
let activeAgentIndex = parseInt(process.env.AGENT_ACCOUNT_INDEX || "0");
let OWNER = process.env.OWNER_ADDRESS;
const CONTRACT = process.env.CONTRACT_ADDRESS || OWNER;
const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:3402";

// Operator key — signs agent-pay and pays gas
// Derived from same mnemonic using OPERATOR_ACCOUNT_INDEX (default: 0)
// Or use raw OPERATOR_PRIVATE_KEY. Falls back to AGENT_KEY if neither is set.
// Production: use KMS/HSM, never store raw key in env
let OPERATOR_KEY;
if (process.env.OPERATOR_PRIVATE_KEY) {
    OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY;
} else if (process.env.AGENT_MNEMONIC && process.env.OPERATOR_ACCOUNT_INDEX !== undefined) {
    const opIdx = parseInt(process.env.OPERATOR_ACCOUNT_INDEX);
    let opWallet = await generateWallet({ secretKey: process.env.AGENT_MNEMONIC, password: "" });
    while (opWallet.accounts.length <= opIdx) {
        opWallet = generateNewAccount(opWallet);
    }
    OPERATOR_KEY = opWallet.accounts[opIdx].stxPrivateKey;
    console.log(`🔑 Operator key derived from mnemonic (account index: ${opIdx})`);
} else {
    OPERATOR_KEY = AGENT_KEY;
}
const operatorAddress = getAddressFromPrivateKey(OPERATOR_KEY, STACKS_TESTNET);

// Scheduler config
let SCHEDULE_MODE = process.env.SCHEDULE_MODE || "once"; // once | interval | pipeline
let SCHEDULE_INTERVAL = parseInt(process.env.SCHEDULE_INTERVAL || "5"); // minutes
let SERVICE_ENDPOINTS = (process.env.SERVICE_ENDPOINTS || "/api/price-feed")
    .split(",")
    .map(s => s.trim());

// Pipeline config
const PIPELINE_FILE = process.env.PIPELINE_FILE || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

// Data delivery config
let DELIVERY_MODE = process.env.DELIVERY_MODE || "off"; // off | webhook | api | both
let WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const AGENT_API_PORT = parseInt(process.env.AGENT_API_PORT || "4000");

// In-memory store for latest results (served by API)
let latestResults = { timestamp: null, services: {}, runs: 0 };

if (!OWNER) {
    console.warn("⚠️  No OWNER_ADDRESS in .env — will be set dynamically from UI");
}

// Use network object for v7 API
let agentAddress = getAddressFromPrivateKey(AGENT_KEY, STACKS_TESTNET);

console.log(`
╔══════════════════════════════════════════════════════╗
║      🤖 Kova AI Agent v3.1 (Operator-Paid x402)     ║
╠══════════════════════════════════════════════════════╣
║  Agent:    ${agentAddress}  ║
║  Operator: ${operatorAddress} ║
║  Owner:    ${OWNER || '(set from UI)'.padEnd(38)}  ║
║  Service:  ${SERVICE_URL.padEnd(38)}    ║
║  Mode:     Operator signs agent-pay (agent = logic)  ║
║  Fee:      2% platform fee per transaction           ║
╚══════════════════════════════════════════════════════╝
`);

if (OPERATOR_KEY === AGENT_KEY) {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ OPERATOR_KEY and AGENT_KEY are identical in production — aborting");
    process.exit(1);
  } else {
    console.warn("⚠️  OPERATOR_KEY not set — using AGENT_KEY as fallback (dev only)\n");
  }
}

// ─── Initialize Telegram Bot ─────────────────────────
const botToken = appState.telegram.botToken;
const botChatId = appState.telegram.chatId;
const botThreshold = appState.telegram.thresholdSTX;
if (botToken) {
    await initBot(botToken, botChatId, botThreshold);
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
        console.error("   ⚠️  Cannot reach service. Is it running?");
        console.error(`   Start it with: cd ../x402-service && npm start`);
        console.error(`   API server still running at localhost:${AGENT_API_PORT}\n`);
        return null;
    }
}

// ─── Main Execution Pipeline ─────────────────────────
const runningAgents = new Set();

// ─── Run a single service endpoint (escrow flow) ─────
async function runService(endpoint) {
    // Snapshot at call time — agent switch during run won't affect this execution
    const currentAgent = agentAddress;
    const currentOwner = OWNER;

    if (runningAgents.has(currentAgent)) {
        console.log(`   ⏳ Agent ${currentAgent} is already running. Skipping...`);
        return null;
    }
    runningAgents.add(currentAgent);

    try {
        console.log(`\n─── Service: ${endpoint} ───────────\n`);

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
    const serviceAddress = serviceInfo?.address || discovery.address; // ✅ per-service address

    let price = 500_000; // default uSTX
    if (serviceInfo) {
        if (serviceInfo.price !== undefined) {
            price = serviceInfo.price;
        } else if (serviceInfo.priceSTX !== undefined) {
            price = Math.round(serviceInfo.priceSTX * 1_000_000);
        }
    }

    console.log(`   💰 Price: ${(price / 1_000_000).toFixed(4)} STX`);
    console.log(`   📋 Service: ${serviceAddress}\n`);

    // 2. Request approval via Telegram (if bot is active)
    const amountSTX = price / 1_000_000;
    if (isBotActive()) {
        const remaining = await fetchCallReadOnlyFunction({
            contractAddress: CONTRACT,
            contractName: CONTRACT_NAME,
            functionName: "get-daily-remaining",
            functionArgs: [standardPrincipalCV(OWNER), standardPrincipalCV(currentAgent)],
            network: STACKS_TESTNET,
            senderAddress: operatorAddress,
        });
        const remainingSTX = parseInt(cvToJSON(remaining)?.value || 0) / 1_000_000;
        const LIMIT_THRESHOLD = 0.1; // STX — tune this

        if (remainingSTX < LIMIT_THRESHOLD) {
            const approved = await requestApproval(price, serviceName || endpoint, serviceAddress);
            if (!approved) {
                console.log("   ❌ Payment rejected by owner via Telegram\n");
                return null;
            }
        }
    }

    // 3. Validate rules on-chain BEFORE paying
    console.log(`📜 Step 2: Validating rules on-chain...\n`);
    const valid = await validateSpend(serviceAddress, price, currentOwner, currentAgent);
    if (!valid) {
        console.log(`   Kill switch active, service not allowed, or limits exceeded`);
        notify(`Block Agent payment for \`${endpoint}\` - *rules check failed*.`);
        return null;
    }

    // 4. Execute agent-pay on escrow contract (autonomous!)
    console.log(`💳 Step 3: Executing agent-pay from escrow...\n`);
    console.log(`   Agent signs contract-call → escrow transfers STX → service receives payment\n`);
    const txId = await agentPay(serviceAddress, price, currentOwner, currentAgent);

    if (!txId) {
        console.log(`   ❌ agent-pay failed — check balance or limits`);
        notify(`❌ Payment *failed* for \`${endpoint}\`\nAgent: \`${currentAgent.slice(0,8)}...\`\nReason: agent-pay failed`);
        return null;
    }

    // 5. Call service for data — include X-PAYMENT header so x402 middleware accepts
    console.log(`📡 Step 4: Fetching data from service...\n`);
    const paymentProof = JSON.stringify({
        transaction: txId,
        payer: operatorAddress,
        network: "stacks:2147483648",
        scheme: "escrow",
    });

    let data = null;
    let attempt = 0;
    const maxAttempts = 6;
    const baseDelayMs = 1000;

    while (attempt < maxAttempts) {
        try {
            const response = await axios.get(`${SERVICE_URL}${endpoint}`, {
                headers: { "X-PAYMENT": paymentProof },
                timeout: 10000
            });
            data = response.data;
            break; // Success!
        } catch (err) {
            const status = err.response?.status;
            // Retry on 402 Payment Required, 429 Too Many Requests, or timeouts
            if (status === 402 || status === 429 || err.code === 'ECONNABORTED') {
                attempt++;
                if (attempt >= maxAttempts) {
                    console.error(`   ❌ Service call failed after ${maxAttempts} attempts: ${err.message}\n`);
                    console.log(`   Note: Payment was made on-chain (tx: ${txId})`);
                    console.log(`   The service may need time to process. Data fetch failed.\n`);
                    notify(`⚠️ Paid for \`${endpoint}\` (tx: ${txId}) but data fetch failed: ${err.message}`);
                    return null;
                }
                // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
                console.log(`   ⏳ Service returned ${status || 'timeout'} — Waiting ${delayMs/1000}s for mempool settlement...`);
                
                // Optional: ask provider what it sees natively
                try {
                    const statusRes = await axios.get(`${SERVICE_URL}/paid-status?txid=${txId}`);
                    if (statusRes.data?.paid) {
                        console.log(`   🔗 Provider sees tx natively: ${statusRes.data.status}`);
                    }
                } catch(e) {}
                
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                // Hard failure (e.g. 500 server error, 404 not found)
                console.error(`   ❌ Service call failed: ${err.message}\n`);
                console.log(`   Note: Payment was made on-chain (tx: ${txId})`);
                notify(`⚠️ Paid for \`${endpoint}\` (tx: ${txId}) but data fetch failed: ${err.message}`);
                return null;
            }
        }
    }
    
    // Success path
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
        `Agent: \`${currentAgent.slice(0, 8)}...${currentAgent.slice(-6)}\``,
        `Amount: *${amountSTX.toFixed(4)} STX*`,
        `TxID: \`${txId.toString().slice(0, 10)}...\``,
        `Method: Escrow agent-pay (autonomous)`,
    ].join("\n"));

    return data;
    } finally {
        runningAgents.delete(currentAgent);
    }
}

// ─── Run all configured services ────────────────────
async function runAllServices(heartbeatSecret = "kova-demo-secret") {
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

    // Heartbeat pulse for UI active status
    try {
        await fetch(`http://localhost:${AGENT_API_PORT}/api/agent-heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: agentAddress, secret: HEARTBEAT_SECRET })
        });
    } catch {}

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

    // ─── Dynamic Agent Creation (KMS substitute for hackathon) ───
    apiServer.use(express.json());

    apiServer.post("/api/create-agent", async (req, res) => {
        try {
            const label = req.body.label || `Agent ${derivedAgents.length + 1}`;
            const requestedIndex = req.body.index;
            const useIndex = (requestedIndex !== undefined && requestedIndex !== null) ? parseInt(requestedIndex) : nextAgentIndex;

            const result = await deriveAgentAtIndex(useIndex);
            derivedAgents.push({ ...result, label });
            
            if (useIndex >= nextAgentIndex) {
                nextAgentIndex = useIndex + 1;
            } else {
                nextAgentIndex++;
            }
            res.json({ address: result.address, index: result.index, label });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Phase 7 APIs: Nonces & Audit Logs ───
    apiServer.get("/api/nonce", (req, res) => {
        import("crypto").then(crypto => {
            const nonce = crypto.randomBytes(16).toString('hex');
            res.json({ nonce });
        }).catch(() => res.json({ nonce: Date.now().toString() }));
    });

    apiServer.post("/api/audit-log", (req, res) => {
        try {
            const entry = { timestamp: new Date().toISOString(), ...req.body };
            fs.appendFileSync("audit.log", JSON.stringify(entry) + "\n");
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: "Failed to write audit log" });
        }
    });

    apiServer.get("/api/agents", (req, res) => {
        // Return addresses only — never expose private keys
        res.json(derivedAgents.map(a => ({ address: a.address, index: a.index, label: a.label })));
    });

    // ─── Activate Agent (switch running agent) ───
    apiServer.post("/api/activate-agent", async (req, res) => {
        try {
            const { index } = req.body;
            if (index === undefined || index === null) {
                return res.status(400).json({ error: "index is required" });
            }
            const targetIndex = parseInt(index);
            const mnemonic = process.env.AGENT_MNEMONIC;
            if (!mnemonic) return res.status(500).json({ error: "No mnemonic configured" });

            let wallet = await generateWallet({ secretKey: mnemonic, password: "" });
            while (wallet.accounts.length <= targetIndex) {
                wallet = generateNewAccount(wallet);
            }
            const account = wallet.accounts[targetIndex];
            AGENT_KEY = account.stxPrivateKey;
            agentAddress = getAddressFromPrivateKey(AGENT_KEY, STACKS_TESTNET);
            activeAgentIndex = targetIndex;

            console.log(`\n🔄 Switched active agent → ${agentAddress} (index ${targetIndex})\n`);
            res.json({ address: agentAddress, index: targetIndex });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    apiServer.get("/api/active-agent", (req, res) => {
        res.json({ address: agentAddress, index: activeAgentIndex });
    });

    // ─── Update Settings dynamically ───
    apiServer.post("/api/settings", async (req, res) => {
        const { mode, intervalValue, serviceEndpoints, ownerAddress, agentAddress: reqAgentAddr, deliveryMode, webhookUrl } = req.body;
        if (deliveryMode) DELIVERY_MODE = deliveryMode;
        if (webhookUrl) WEBHOOK_URL = webhookUrl;
        
        if (mode) SCHEDULE_MODE = mode;
        if (intervalValue) SCHEDULE_INTERVAL = parseInt(intervalValue);
        if (serviceEndpoints) {
            SERVICE_ENDPOINTS = serviceEndpoints.split(",").map(s => s.trim()).filter(Boolean);
        }
        if (ownerAddress && ownerAddress !== OWNER) {
            OWNER = ownerAddress;
            console.log(`👤 Switched owner → ${OWNER}`);
        }

        // Switch agent by address if provided
        if (reqAgentAddr && reqAgentAddr !== agentAddress) {
            const match = derivedAgents.find(a => a.address === reqAgentAddr);
            if (match) {
                const mnemonic = process.env.AGENT_MNEMONIC;
                if (mnemonic) {
                    try {
                        let wallet = await generateWallet({ secretKey: mnemonic, password: "" });
                        while (wallet.accounts.length <= match.index) wallet = generateNewAccount(wallet);
                        AGENT_KEY = wallet.accounts[match.index].stxPrivateKey;
                        agentAddress = getAddressFromPrivateKey(AGENT_KEY, STACKS_TESTNET);
                        activeAgentIndex = match.index;
                        console.log(`🔄 Switched to agent ${agentAddress} (index ${match.index})`);
                    } catch (err) {
                        console.error("Failed to switch agent:", err);
                    }
                }
            } else {
                // unknown agent — try to find its index by scanning mnemonic
                console.log(`🔍 Agent ${reqAgentAddr} not in derivedAgents, scanning mnemonic...`);
                const mnemonic = process.env.AGENT_MNEMONIC;
                if (mnemonic) {
                    let found = false;
                    for (let idx = 0; idx <= 20; idx++) {
                        try {
                            const result = await deriveAgentAtIndex(idx);
                            if (result.address === reqAgentAddr) {
                                derivedAgents.push({ ...result, label: `Agent ${derivedAgents.length + 1}` });
                                AGENT_KEY = (await generateWallet({ secretKey: mnemonic, password: "" }))
                                    .accounts[idx]?.stxPrivateKey || AGENT_KEY;
                                // re-derive properly
                                let wallet = await generateWallet({ secretKey: mnemonic, password: "" });
                                while (wallet.accounts.length <= idx) wallet = generateNewAccount(wallet);
                                AGENT_KEY = wallet.accounts[idx].stxPrivateKey;
                                agentAddress = getAddressFromPrivateKey(AGENT_KEY, STACKS_TESTNET);
                                activeAgentIndex = idx;
                                console.log(`✅ Auto-derived agent ${agentAddress} at index ${idx}`);
                                found = true;
                                break;
                            }
                        } catch (e) {}
                    }
                    if (!found) console.warn(`❌ Could not find ${reqAgentAddr} in first 20 indexes`);
                }            
            }
        }

        console.log(`\n⚙️  Settings updated via UI`);
        applySchedule(HEARTBEAT_SECRET);
        res.json({ status: "ok", mode: SCHEDULE_MODE, interval: SCHEDULE_INTERVAL, endpoints: SERVICE_ENDPOINTS });
    });

    // ─── Phase 4 APIs: Info, Activity, Config, Heartbeats ───
    apiServer.get("/api/operator-info", (req, res) => {
        res.json({
            operatorAddress,
            agentAddress,
            isOperatorSeparate: OPERATOR_KEY !== AGENT_KEY,
        });
    });

    apiServer.get("/api/activity", async (req, res) => {
        try {
            const { owner, agent, limit = 20, offset = 0 } = req.query;
            if (!owner) return res.status(400).json({ error: "owner missing" });

            let requestedAgents = [];
            if (!agent || agent === "ALL" || agent === "") {
                requestedAgents = derivedAgents.map(a => a.address);
                if (agentAddress && !requestedAgents.includes(agentAddress)) {
                    requestedAgents.push(agentAddress);
                }
            } else if (agent.includes(",")) {
                requestedAgents = agent.split(",").map(a => a.trim()).filter(Boolean);
            } else {
                requestedAgents = [agent];
            }

            // Helper: retry a fetch up to 3 times
            async function fetchWithRetry(fn, retries = 3) {
                for (let i = 0; i < retries; i++) {
                    try {
                        return await fn();
                    } catch (e) {
                        if (i === retries - 1) throw e;
                        // Parse wait time from 429 message
                        const match = e.message?.match(/try again in (\d+) seconds/i);
                        const waitMs = match ? (parseInt(match[1]) + 1) * 1000 : 2000 * (i + 1);
                        console.log(`Rate limited, waiting ${waitMs/1000}s...`);
                        await new Promise(r => setTimeout(r, waitMs));
                    }
                }
            }

            // Step 1: get all nonces first (total count source of truth)
            const agentNonces = [];
            for (const addr of requestedAgents) {
                try {
                    const nonceResult = await fetchWithRetry(() => fetchCallReadOnlyFunction({
                        contractAddress: CONTRACT,
                        contractName: CONTRACT_NAME,
                        functionName: "get-spend-nonce",
                        functionArgs: [standardPrincipalCV(owner), standardPrincipalCV(addr)],
                        network: STACKS_TESTNET,
                        senderAddress: operatorAddress,
                    }));
                    const nonceInt = parseInt(cvToJSON(nonceResult)?.value?.value || cvToJSON(nonceResult)?.value || 0);
                    agentNonces.push({ addr, nonce: nonceInt });
                } catch (e) {
                    console.error(`Failed to get nonce for ${addr}:`, e.message);
                }
            }

            // Total is sum of all nonces (each nonce = number of records)
            const totalCount = agentNonces.reduce((sum, a) => sum + a.nonce, 0);

            // Step 2: build index of all (agent, nonce) pairs sorted by... 
            // we don't know block yet, so fetch ALL then sort
            // For large datasets, fetch in parallel batches
            const allRecords = [];

            for (let agentIdx = 0; agentIdx < agentNonces.length; agentIdx++) {
                const { addr, nonce: nonceInt } = agentNonces[agentIdx];
                
                const indices = Array.from({ length: nonceInt }, (_, i) => nonceInt - 1 - i);
                const BATCH_SIZE = 2;
                
                for (let b = 0; b < indices.length; b += BATCH_SIZE) {
                    const batch = indices.slice(b, b + BATCH_SIZE);
                    const results = await Promise.allSettled(
                        batch.map(i => fetchWithRetry(() => fetchCallReadOnlyFunction({
                            contractAddress: CONTRACT,
                            contractName: CONTRACT_NAME,
                            functionName: "get-spend-record",
                            functionArgs: [standardPrincipalCV(owner), standardPrincipalCV(addr), uintCV(i)],
                            network: STACKS_TESTNET,
                            senderAddress: operatorAddress,
                        })).then(r => ({ i, r }))
                    ));

                    for (const result of results) {
                        if (result.status === "fulfilled") {
                            const { i, r } = result.value;
                            const rJson = cvToJSON(r);
                            if (rJson?.value?.value) {
                                const v = rJson.value.value;
                                allRecords.push({
                                    nonce: i,
                                    agent: addr,
                                    service: v.service.value,
                                    amount: parseInt(v.amount.value),
                                    fee: parseInt(v.fee?.value || 0),
                                    block: parseInt(v.block.value),
                                });
                            }
                        } else {
                            console.warn(`Failed record fetch:`, result.reason?.message);
                        }
                    }

                    // Delay between batches
                    if (b + BATCH_SIZE < indices.length) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }

                // Delay between agents
                if (agentIdx < agentNonces.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Sort by block desc, then agent, then nonce desc
            allRecords.sort((a, b) => b.block - a.block || a.agent.localeCompare(b.agent) || b.nonce - a.nonce);

            const sliced = allRecords.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

            res.json({ totalCount, records: sliced });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    const usedNonces = new Set();
    const rateLimits = new Map();

    apiServer.post("/api/save-telegram-config", async (req, res) => {
        const ip = req.ip || "unknown";
        const now = Date.now();
        const limits = rateLimits.get(ip) || { count: 0, time: now };
        if (now - limits.time > 60000) { limits.count = 0; limits.time = now; } // 1 minute window
        if (limits.count >= 10) return res.status(429).json({ error: "Too many requests" });
        limits.count++;
        rateLimits.set(ip, limits);

        try {
            const { owner, botToken, chatId, thresholdSTX, nonce, publicKey, signature } = req.body;
            
            if (!owner || !publicKey || !signature || !nonce) {
                return res.status(400).json({ error: "Missing signature payload for authentication." });
            }

            if (usedNonces.has(nonce)) {
                return res.status(401).json({ error: "Nonce already used. Replay detected." });
            }

            // Verify signature using @stacks/encryption
            const message = `kova:link-telegram:${owner}:${nonce}`;
            const isValid = verifyMessageSignatureRsv({ message, signature, publicKey });

            if (!isValid) {
                return res.status(401).json({ error: "Invalid signature." });
            }

            // Derive address from public key and verify it matches owner
            const derivedAddress = publicKeyToAddress(publicKey, "testnet");

            if (derivedAddress !== owner) {
                return res.status(401).json({ error: "Signer address does not match owner." });
            }

            await initBot(botToken, chatId, parseFloat(thresholdSTX || "0.05"));
            appState.telegram = { botToken, chatId, thresholdSTX: parseFloat(thresholdSTX || "0.05") };
            saveState();

            usedNonces.add(nonce);
            if (usedNonces.size > 1000) usedNonces.clear(); // TTL basic cleanup

            console.log(`\n⚙️  Telegram config updated via UI (Threshold: ${thresholdSTX} STX)`);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        } 
    });

    const agentHeartbeats = new Map();
    const HEARTBEAT_SECRET = process.env.HEARTBEAT_SECRET || "kova-demo-secret";

    apiServer.post("/api/agent-heartbeat", (req, res) => {
        const ip = req.ip || "unknown";
        const now = Date.now();
        const limits = rateLimits.get(ip) || { count: 0, time: now };
        if (now - limits.time > 60000) { limits.count = 0; limits.time = now; } // 1 minute window
        if (limits.count >= 60) return res.status(429).json({ error: "Too many requests" });
        limits.count++;
        rateLimits.set(ip, limits);

        const { agent, secret } = req.body;
        if (secret !== HEARTBEAT_SECRET) {
            return res.status(401).json({ error: "Unauthorized heartbeat" });
        }
        if (agent) {
            agentHeartbeats.set(agent, Date.now());
        }
        res.json({ success: true });
    });

    apiServer.get("/api/agent-status", async (req, res) => {
        try {
            const { owner, agent } = req.query;
            if (!agent) return res.status(400).json({ error: "agent missing" });

            const lastSeen = agentHeartbeats.get(agent) || 0;
            const running = runningAgents.has(agent); // Expose pipeline lock status
            let onChainActive = true;
            if (owner) {
                try {
                    const result = await fetchCallReadOnlyFunction({
                        contractAddress: CONTRACT,
                        contractName: CONTRACT_NAME,
                        functionName: "get-wallet",
                        functionArgs: [standardPrincipalCV(owner), standardPrincipalCV(agent)],
                        network: STACKS_TESTNET,
                        senderAddress: operatorAddress,
                    });
                    const json = cvToJSON(result);
                    if (json?.value?.value?.active !== undefined) {
                        onChainActive = json.value.value.active.value === true;
                    }
                } catch (e) {
                    // ignore mapping error
                }
            }
            res.json({ lastSeen, running, onChainActive });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    apiServer.post("/api/run-pipeline", async (req, res) => {
        const { pipeline } = req.body;
        if (!pipeline) return res.status(400).json({ error: "pipeline missing" });

        if (pipeline.owner) OWNER = pipeline.owner;
        console.log(`\n🔗 Running pipeline from UI: ${pipeline.name}`);
        
        res.json({ success: true }); // respond immediately
        
        // Run and store results
        try {
            const results = await runPipeline(pipeline);
            latestResults = {
                timestamp: new Date().toISOString(),
                services: {},
                pipeline: results,
                runs: latestResults.runs + 1,
                agent: agentAddress,
                owner: OWNER,
            };
        } catch (e) {
            console.error("Pipeline error:", e);
        }

        if (pipeline.scheduleInterval) {
            const ms = pipeline.scheduleInterval * 60 * 1000;
            setInterval(() => runPipeline(pipeline), ms);
            console.log(`⏱️ Pipeline scheduled every ${pipeline.scheduleInterval} minutes`);
        }
    });

    apiServer.listen(AGENT_API_PORT, () => {
        console.log(`  🌐 Agent API running → http://localhost:${AGENT_API_PORT}/api/latest`);
        console.log(`  🔄 Settle endpoint → POST http://localhost:${AGENT_API_PORT}/api/settle-escrow`);
        console.log(`  🔑 Operator info  → GET  http://localhost:${AGENT_API_PORT}/api/operator-info`);
        console.log(`  💡 Any app can fetch latest results from this URL\n`);
    });
}

async function deriveAgentAtIndex(index) {
    const mnemonic = process.env.AGENT_MNEMONIC;
    if (!mnemonic) throw new Error("No AGENT_MNEMONIC in .env");

    let wallet = await generateWallet({ secretKey: mnemonic, password: "" });
    while (wallet.accounts.length <= index) {
        wallet = generateNewAccount(wallet);
    }
    const account = wallet.accounts[index];
    const address = getAddressFromPrivateKey(account.stxPrivateKey, STACKS_TESTNET);
    return { address, index };
}

// Pre-populate with the current agent
derivedAgents.push({ address: agentAddress, index: parseInt(process.env.AGENT_ACCOUNT_INDEX || "0"), label: "Agent 1" });
// Skip +2 to avoid colliding with the user's connected Leather wallet
// (user's wallet may occupy indexes 0, 1, 2, 3 — agent starts at index+2)
nextAgentIndex = parseInt(process.env.AGENT_ACCOUNT_INDEX || "0") + 2;

let currentIntervalId = null;

function applySchedule(heartbeatSecret = "kova-demo-secret") {
    if (currentIntervalId) {
        clearInterval(currentIntervalId);
        currentIntervalId = null;
    }

    if (SCHEDULE_MODE === "idle") {
        console.log(`⏸️  Agent idle — waiting for UI configuration.\n`);
        return; // ✅ don't run anything
    }

    console.log(`\n📋 Schedule mode: ${SCHEDULE_MODE}`);
    if (SCHEDULE_MODE === "interval") {
        console.log(`⏱️  Interval: every ${SCHEDULE_INTERVAL} minute(s)`);
    }
    console.log(`📡 Endpoints: ${SERVICE_ENDPOINTS.join(", ")}`);

    if (SCHEDULE_MODE === "once") {
        runAllServices(heartbeatSecret);
        if (isBotActive() || DELIVERY_MODE === "api" || DELIVERY_MODE === "both") {
            console.log("📱 Agent is waiting for schedules. Press Ctrl+C to stop.\n");
        }
    } else if (SCHEDULE_MODE === "interval") {
        console.log(`🔄 Agent will run every ${SCHEDULE_INTERVAL} minute(s). Press Ctrl+C to stop.\n`);
        const intervalMs = SCHEDULE_INTERVAL * 60 * 1000;
        currentIntervalId = setInterval(async () => {
            await runAllServices(heartbeatSecret);
        }, intervalMs);
    }
}

// ─── Main: Scheduler ────────────────────────────────
async function main() {
    console.log(`📤 Delivery: ${DELIVERY_MODE}${DELIVERY_MODE === "webhook" || DELIVERY_MODE === "both" ? ` → ${WEBHOOK_URL}` : ""}\n`);

    // Start API server always (frontend needs /api/create-agent during setup)
    startApiServer();

    if (SCHEDULE_MODE === "once" || SCHEDULE_MODE === "interval") {
        const heartbeatSecret = process.env.HEARTBEAT_SECRET || "kova-demo-secret";
        applySchedule(heartbeatSecret);

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
    
    } else if (SCHEDULE_MODE === "idle") {
        console.log("⏸️  Agent idle — waiting for UI. Press Ctrl+C to stop.\n");
        // just keep running for API server
    } 
    else {
        console.error(`❌ Unknown SCHEDULE_MODE: ${SCHEDULE_MODE}`);
        console.error(`   Valid modes: once, interval, pipeline`);
        process.exit(1);
    }
}

// ─── Pipeline Executor ──────────────────────────────
async function runPipeline(pipeline) {
    // Snapshot at pipeline start — agent switch mid-pipeline won't corrupt steps
    const currentAgent = agentAddress;
    const currentOwner = OWNER;

    const stepResults = {};
    const results = {
        pipeline: pipeline.name,
        timestamp: new Date().toISOString(),
        steps: [],
        agent: currentAgent,
        owner: currentOwner,
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
            const valid = await validateSpend(serviceAddr, price, currentOwner, currentAgent);
            if (!valid) {
                console.log(`   ❌ Rules check failed for ${step.service}`);
                results.steps.push({ step: stepNum, type: step.type, status: "blocked", reason: "rules check failed" });
                continue;
            }

            // Execute agent-pay from escrow
            const txId = await agentPay(serviceAddr, price, currentOwner, currentAgent);
            if (!txId) {
                console.log(`   ❌ agent-pay failed for ${step.service}`);
                results.steps.push({ step: stepNum, type: step.type, status: "failed", reason: "agent-pay failed" });
                continue;
            }

            // Fetch data from service
            try {
                const paymentProof = JSON.stringify({
                    transaction: txId,
                    payer: operatorAddress,
                    network: "stacks:2147483648",
                    scheme: "escrow",
                });
                const response = await axios.get(step.url, {
                    headers: { "X-PAYMENT": paymentProof },
                    timeout: 10000
                });
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
                    // In agent.js callLLM default
                    model: step.llmModel || "mistralai/mistral-small-3.1-24b-instruct:free",
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

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model,
                messages: [
                    { role: "system", content: "You are a data analysis agent for Kova. Analyze the provided data from multiple services and give a clear, actionable recommendation. Be concise — max 3 sentences." },
                    { role: "user", content: `${prompt}\n\n--- Data from previous steps ---\n${contextStr}` },
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
        } catch (err) {
            if (err.response?.status === 429) {
                console.log(`   ⏳ Rate limited — waiting ${10 * (attempt + 1)}s...`);
                await new Promise(r => setTimeout(r, 10000 * (attempt + 1)));
                lastErr = err;
            } else {
                throw err;
            }
        }
    }

    // All retries exhausted — return contextual mock for demo
    console.log(`   ⚠️ OpenRouter rate limited — using demo analysis`);
    const prices = Object.entries(context).flatMap(([_, data]) => 
        data.prices ? Object.entries(data.prices).map(([coin, p]) => `${coin}: $${Number(p.usd).toFixed(0)}`) : []
    ).join(", ");
    return `**Demo Analysis** — Based on current market data (${prices || "fetched via x402"}): Markets show mixed signals with moderate volatility. BTC remains range-bound while STX shows relative strength. **Recommendation: HOLD** — await clearer momentum before new positions.`;
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
