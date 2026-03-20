# Kova Protocol — Autonomous Agent Payments on Bitcoin

Kova is a smart escrow protocol that enables AI agents to autonomously pay for 
data services via the X402 HTTP payment standard, with hard spending rules 
enforced by Clarity smart contracts on the Stacks blockchain.

## What is Kova?

AI agents need to autonomously purchase data and services — but giving an AI 
unrestricted wallet access is dangerous. Kova solves this by placing agent funds 
in a Clarity smart contract escrow that enforces:

- **Daily spending limits** — hard cap on how much an agent can spend per day
- **Per-call caps** — maximum cost per single service call
- **Service allowlists** — agent can only pay pre-approved service addresses
- **Kill switch** — owner can freeze all agent spending instantly, on-chain

## Architecture
```
Owner Wallet
    │
    ├── register-operator(backend)     # one-time handshake
    ├── deposit(agent, amount)         # fund agent escrow
    ├── allow-service(agent, service)  # whitelist service on-chain
    │
    └── Clarity Smart Contract (agent-wallet-v7)
            │
            └── agent-pay(owner, agent, service, amount)
                    │
                    ├── validates rules (limits, allowlist, kill switch)
                    ├── transfers STX → service (98%)
                    └── transfers STX → platform (2% fee)
```

**Operator Model:** The backend operator signs `agent-pay` transactions and pays 
gas fees. The agent is purely logical software — no private keys, no gas 
required.

**X402 Protocol:** Agent autonomously discovers HTTP 402 paywalls, validates 
on-chain rules, and pays atomically before receiving data.

## Project Structure
```
kova/
├── frontend/          # React + TypeScript + Tailwind UI
├── agent/             # Node.js operator backend + pipeline executor
│   ├── agent.js       # main backend (port 4000)
│   └── audit.log      # on-chain transaction trace
└── x402-service/      # Express.js X402-protected data services
    ├── server.js       # service server (port 3402)
    └── service-registry.json
```

## Getting Started

**Prerequisites:** Node.js 18+, Hiro Wallet browser extension, Stacks testnet STX

**1. Start the X402 service server**
```bash
cd x402-service
npm install
node server.js        # runs on port 3402
```

**2. Start the agent backend**
```bash
cd agent
npm install
node agent.js         # runs on port 4000
```

**3. Start the frontend**
```bash
cd frontend
npm install
npm run dev           # runs on port 5173
```

**4. Connect Hiro Wallet** at `http://localhost:5173` and complete the 
Wallet Setup flow.

## Security & Architecture Notes

### Operator-Paid Model
The backend operator signs `agent-pay` and pays Stacks transaction fees. 
The agent has zero keys and zero gas requirements — all authorization is 
verified by the Clarity contract against the registered operator principal.

### Nonce-Based Audit Trail
Every successful payment is logged on-chain via the `spend-log` map with a 
strictly incrementing nonce per agent. This prevents replay attacks and 
provides an immutable spending history queryable directly from the contract.

### Off-Chain Execution Locks
The agent backend maintains in-memory execution locks to prevent race 
conditions and duplicate pipeline executions during concurrent runs.

### Rotating the Heartbeat Secret
The agent and frontend coordinate via a shared secret to populate real-time 
"Agent Running" indicators on the Dashboard.

To rotate:
1. Open `agent/.env`
2. Update `HEARTBEAT_SECRET=your-new-secure-value`
3. Restart `node agent.js`

> Default fallback value is `"kova-demo-secret"` if no env variable is set.

## Audit Logs

Every owner action (deposit, withdraw, allow-service, register-operator) is 
asynchronously pushed from the frontend to `agent/audit.log` as a JSON trace. 
Review this file for a temporal timeline of all agent operations.

## Smart Contract

Deployed on Stacks Testnet: `agent-wallet-v7.clar`

Key functions:
| Function | Caller | Description |
|---|---|---|
| `create-wallet` | Owner | Initialize agent escrow with limits |
| `deposit` | Owner | Fund agent escrow |
| `register-operator` | Owner | Authorize backend operator |
| `allow-service` | Owner | Whitelist service address |
| `agent-pay` | Operator | Execute autonomous payment |
| `set-active` | Owner | Toggle kill switch |
| `set-limits` | Owner | Update spending constraints |

## Fee Model

Platform fee: **2% per transaction**, deducted atomically by the contract.
```
service receives = amount × 98%
platform receives = amount × 2%
```

## Built With

- [Stacks](https://stacks.co) — smart contract layer settling on Bitcoin
- [Clarity](https://clarity-lang.org) — predictable, non-Turing-complete smart contracts
- [X402 Protocol](https://x402.org) — HTTP-native payment standard
- [Hiro Wallet](https://wallet.hiro.so) — Stacks wallet
- [OpenRouter](https://openrouter.ai) — LLM inference for pipeline analysis

## License

MIT