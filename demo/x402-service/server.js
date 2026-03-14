import express from "express";
import cors from "cors";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { x402PaymentRequired, getPayment, STXtoMicroSTX } = require("x402-stacks");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Config ──────────────────────────────────────────
const PORT = 3402;
// Use Index 4 purely as the Service address
const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || "ST49MX8AXSS72KPVE9N1YB5J9KZZXRM8J65J7663";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402-facilitator.onrender.com";

// ─── API Endpoints ───────────────────────────────────

// Price Feed — returns mock crypto prices (0.5 STX)
app.get("/api/price-feed",
    x402PaymentRequired({
        amount: STXtoMicroSTX(0.5),
        address: SERVICE_ADDRESS,
        network: "testnet",
        facilitatorUrl: FACILITATOR_URL,
        description: "Crypto price feed data",
    }),
    (req, res) => {
        const payment = getPayment(req);
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
);

// Text Summarizer — returns a simple summary (1.0 STX)
app.get("/api/summarize",
    x402PaymentRequired({
        amount: STXtoMicroSTX(1.0),
        address: SERVICE_ADDRESS,
        network: "testnet",
        facilitatorUrl: FACILITATOR_URL,
        description: "AI text summarization service",
    }),
    (req, res) => {
        const payment = getPayment(req);
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
);

// Health check (free, no payment required)
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "kova-x402-service",
        address: SERVICE_ADDRESS,
        facilitator: FACILITATOR_URL,
        endpoints: [
            { path: "/api/price-feed", price: "0.5 STX", description: "Crypto price data" },
            { path: "/api/summarize?text=...", price: "1 STX", description: "Text summarization" },
        ],
    });
});

// Service info for X402 discovery (V2 format)
app.get("/.well-known/x402", (req, res) => {
    res.json({
        x402Version: 2,
        address: SERVICE_ADDRESS,
        network: "stacks:2147483648",
        facilitatorUrl: FACILITATOR_URL,
        services: [
            {
                name: "price-feed",
                price: Number(STXtoMicroSTX(0.5)),
                priceSTX: "0.500000",
                asset: "STX",
                scheme: "exact",
            },
            {
                name: "summarize",
                price: Number(STXtoMicroSTX(1.0)),
                priceSTX: "1.000000",
                asset: "STX",
                scheme: "exact",
            },
        ],
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

// ─── Start ───────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🔒 Kova X402 Service running on http://localhost:${PORT}`);
    console.log(`   Service address: ${SERVICE_ADDRESS}`);
    console.log(`   Facilitator:     ${FACILITATOR_URL}`);
    console.log(`\n   Endpoints:`);
    console.log(`   GET /health                     — Free health check`);
    console.log(`   GET /api/price-feed              — 0.5 STX (x402)`);
    console.log(`   GET /api/summarize?text=...      — 1.0 STX (x402)`);
    console.log(`   GET /.well-known/x402            — Service discovery`);
    console.log(`   GET /paid-status?txid=...        — Verify tx state\n`);
});
