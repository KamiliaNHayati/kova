import express from "express";
import cors from "cors";
import { createRequire } from "module";
// In-memory service registry (persisted to file)
import fs from "fs";

const REGISTRY_FILE = "service-registry.json";
const require = createRequire(import.meta.url);
const { x402PaymentRequired, getPayment, STXtoMicroSTX } = require("x402-stacks");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Config ──────────────────────────────────────────
const PORT = 3402;
// Use Index 4 purely as the Service address
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402-facilitator.onrender.com";
const PRICE_FEED_ADDRESS = "STEZW9BF0WATG4DXJTHBFP8WKKEANCY70059MHKW";
const SUMMARIZER_ADDRESS = "ST2RXHMZKSQSTMK15JEQK4KP5N2YE66F999A7FSXE";

let dynamicServices = [];
try {
    if (fs.existsSync(REGISTRY_FILE)) {
        dynamicServices = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
        console.log(`📋 Loaded ${dynamicServices.length} registered services`);
    }
} catch (e) {}

function saveRegistry() {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(dynamicServices, null, 2));
}

function withEscrowFallback(x402Options, handler) {
    const x402Middleware = x402PaymentRequired(x402Options);
    return (req, res, next) => {
        const paymentHeader = req.headers["x-payment"];
        if (paymentHeader) {
            try {
                const proof = JSON.parse(paymentHeader);
                if (proof.scheme === "escrow" && proof.transaction) {
                    req.payment = proof;
                    return handler(req, res, next); // skip x402 entirely
                }
            } catch (e) {}
        }
        // No escrow proof — run x402 middleware then handler
        x402Middleware(req, res, () => handler(req, res, next));
    };
}

// ─── API Endpoints ───────────────────────────────────

// Price Feed — returns mock crypto prices (0.5 STX)
app.get("/api/price-feed", 
    withEscrowFallback({
        amount: STXtoMicroSTX(0.5),
        address: PRICE_FEED_ADDRESS,
        network: "testnet",
        facilitatorUrl: FACILITATOR_URL,
        description: "Crypto price feed data",
    }, (req, res) => {
        const payment = req.payment || getPayment(req);
            const prices = {
                timestamp: new Date().toISOString(),
                prices: {
                    BTC: { usd: 97_250 + Math.random() * 500, change24h: (Math.random() * 6 - 3).toFixed(2) + "%" },
                    ETH: { usd: 3_420 + Math.random() * 100, change24h: (Math.random() * 6 - 3).toFixed(2) + "%" },
                    STX: { usd: 1.85 + Math.random() * 0.2, change24h: (Math.random() * 8 - 4).toFixed(2) + "%" },
                },
                source: "kova-price-feed",
                paidBy: payment?.payer || "unknown",
                note: "This data was paid for via x402 protocol",
            };
            res.json(prices);
        }
    )
);

// Text Summarizer — returns a simple summary (1.0 STX)
app.get("/api/summarize",
    withEscrowFallback({
        amount: STXtoMicroSTX(1.0),
        address: SUMMARIZER_ADDRESS,
        network: "testnet",
        facilitatorUrl: FACILITATOR_URL,
        description: "AI text summarization service",
    }, (req, res) => {
        const payment = req.payment || getPayment(req);
            const text = req.query.text || "No text provided";

            // Simple mock summarization
            const words = text.split(" ");
            const summary =
                words.length > 20
                    ? words.slice(0, 15).join(" ") + "... [summarized by Kova AI]"
                    : `Summary: ${text} [processed by Kova AI]`;

            res.json({
                timestamp: new Date().toISOString(),
                original_length: text.length,
                summary,
                service: "kova-summarizer",
                paidBy: payment?.payer || "unknown",
                note: "This summary was paid for via x402 protocol",
            });
        }
    )
);

// Health check (free, no payment required)
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "kova-x402-service",
        address: "STB98064SK9G9J4XWP0T2KJDG37JQ3N3T84JMXX2",
        facilitator: FACILITATOR_URL,
        endpoints: [
            { path: "/api/price-feed", price: "0.5 STX", description: "Crypto price data" },
            { path: "/api/summarize?text=...", price: "1 STX", description: "Text summarization" },
        ],
    });
});

// Service info for X402 discovery (V2 format)
app.get("/.well-known/x402", (req, res) => {
    const staticServices = [
        { name: "price-feed", address: PRICE_FEED_ADDRESS, price: Number(STXtoMicroSTX(0.5)), priceSTX: "0.500000", asset: "STX", scheme: "exact" },
        { name: "summarize", address: SUMMARIZER_ADDRESS, price: Number(STXtoMicroSTX(1.0)), priceSTX: "1.000000", asset: "STX", scheme: "exact" },
    ];
    const dynServices = dynamicServices.filter(s => s.active).map(s => ({
        name: s.name,
        address: s.address,
        price: s.price,
        priceSTX: s.priceSTX || s.priceSTX,
        asset: "STX",
        scheme: "exact",
        url: `/api/ext/${s.name}`,
    }));
    res.json({
        x402Version: 2,
        address: PRICE_FEED_ADDRESS,
        network: "stacks:2147483648",
        facilitatorUrl: FACILITATOR_URL,
        services: [...staticServices, ...dynServices],
    });
});

// Helper to confirm payment tx status natively 
app.get("/paid-status", async (req, res) => {
    const txid = req.query.txid;
    if (!txid) return res.status(400).json({ error: "txid required" });

    try {
        const fetchUrl = `https://api.testnet.hiro.so/extended/v1/tx/${txid}`;
        const response = await fetch(fetchUrl);
        if (response.status === 200) {
            const data = await response.json();
            // In mempool ("pending") or already confirmed ("success")
            if (data.tx_status === "pending" || data.tx_status === "success" || data.tx_status === "success_anchor_block") {
                return res.json({ paid: true, status: data.tx_status });
            }
        }
        res.json({ paid: false, status: "not_found" });
    } catch (err) {
        res.status(500).json({ error: "Failed to verify transaction natively" });
    }
});

// Register a new service
// Register a new service
app.post("/api/register-service", (req, res) => {
    const { name, description, url, priceSTX, address } = req.body;
    console.log("📥 Register request:", req.body);
    if (!name || !url || !priceSTX || !address) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    const existing = dynamicServices.find(s => s.name === name);
    if (existing) {
        return res.status(409).json({ error: "Service name already taken" });
    }
    const service = {
        name: name.toLowerCase().replace(/\s+/g, "-"),
        description: description || "",
        url,
        priceSTX: parseFloat(priceSTX).toFixed(6),
        price: Math.round(parseFloat(priceSTX) * 1_000_000),
        address,
        registeredAt: new Date().toISOString(),
        active: true,
    };
    dynamicServices.push(service);
    saveRegistry();
    console.log(`✅ Service registered: ${service.name} @ ${address}`);
    res.json({ success: true, service });
});

// List all services
app.get("/api/services", (req, res) => {
    const staticServices = [
        {
            name: "price-feed",
            description: "Real-time crypto price data (BTC, ETH, STX)",
            url: "http://localhost:3402/api/price-feed",
            priceSTX: "0.500000",
            price: Number(STXtoMicroSTX(0.5)),
            address: PRICE_FEED_ADDRESS,
            active: true,
        },
        {
            name: "summarize",
            description: "AI-powered text summarization",
            url: "http://localhost:3402/api/summarize",
            priceSTX: "1.000000",
            price: Number(STXtoMicroSTX(1.0)),
            address: SUMMARIZER_ADDRESS,
            active: true,
        },
    ];

    // Merge static + dynamic, dynamic overrides if same name
    const merged = [...staticServices];
    for (const svc of dynamicServices) {
        if (!merged.find(s => s.name === svc.name)) {
            merged.push(svc);
        }
    }

    res.json({ services: merged });
});

// Dynamic proxy — no x402 here, the target service handles payment
app.use("/api/ext/:serviceName", async (req, res) => {
    const paymentHeader = req.headers["x-payment"];
    const svc = dynamicServices.find(s => s.name === req.params.serviceName && s.active);
    if (!svc) return res.status(404).json({ error: "Service not found" });
    
    try {
        const response = await fetch(svc.url, {
            headers: { 
                "X-PAYMENT": paymentHeader || "",
                "Content-Type": "application/json"
            }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(502).json({ error: "Service unavailable" });
    }
});

app.delete("/api/services/:name", (req, res) => {
    const name = req.params.name.toLowerCase();
    const index = dynamicServices.findIndex(s => s.name === name);
    if (index === -1) {
        return res.status(404).json({ error: "Service not found" });
    }
    dynamicServices.splice(index, 1);
    saveRegistry();
    console.log(`🗑️ Service deleted from registry: ${name}`);
    res.json({ success: true });
});

// ─── Start ───────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🔒 Kova X402 Service running on http://localhost:${PORT}`);
    console.log(`   Service Price Feed address: ${PRICE_FEED_ADDRESS}`);
    console.log(`   Service Summarizer address: ${SUMMARIZER_ADDRESS}`);
    console.log(`   Facilitator:     ${FACILITATOR_URL}`);
    console.log(`\n   Endpoints:`);
    console.log(`   GET /health                     — Free health check`);
    console.log(`   GET /api/price-feed              — 0.5 STX (x402)`);
    console.log(`   GET /api/summarize?text=...      — 1.0 STX (x402)`);
    console.log(`   GET /.well-known/x402            — Service discovery`);
    console.log(`   GET /paid-status?txid=...        — Verify tx state\n`);
});
