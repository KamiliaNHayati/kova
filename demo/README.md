# Kova Demo — AI Agent + X402 Services

This demo shows the complete Kova flow:

```
Agent → Calls service → Gets 402 → Pays via agent-spend → Gets data
```

## Quick Start

### 1. Start the X402 Service

```bash
cd demo/x402-service
npm start
```

You should see:
```
🔒 Kova X402 Service running on http://localhost:3402
   GET /api/price-feed    — 0.01 STX (X402)
   GET /api/summarize     — 0.02 STX (X402)
```

### 2. Test 402 Response

Visit `http://localhost:3402/api/price-feed` in your browser — you'll get:
```json
{ "status": 402, "message": "Payment Required", "x-payment": { ... } }
```

### 3. Set Up the Agent

```bash
cd demo/agent
cp .env.example .env
```

Edit `.env` with:
- `AGENT_PRIVATE_KEY` — Your agent account's private key
- `OWNER_ADDRESS` — The wallet owner's address

### 4. Prepare Before Running

Make sure your Kova wallet has:
- ✅ STX deposited (at least 0.1 STX)
- ✅ Agent address set to the agent account
- ✅ Service address allowlisted (`STWEW...5CC37` or the service address)
- ✅ Wallet is active (not killed)

### 5. Run the Agent

```bash
cd demo/agent
node agent.js
```

The agent will:
1. 🔍 Discover available services
2. 📡 Call the price feed API → get 402
3. 💳 Call `agent-spend` on the contract → sign with agent key
4. ⏳ Wait for tx confirmation (~30-60 seconds)
5. 🎉 Retry with payment proof → get price data!

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  AI Agent   │──402──→ │  X402 Service    │         │ Smart       │
│  (Node.js)  │         │  (Express.js)    │         │ Contract    │
│             │──pay──→ │                  │         │ (Clarity)   │
│             │         │                  │←──STX── │             │
│             │←─data── │                  │         │             │
└─────────────┘         └──────────────────┘         └─────────────┘
```
