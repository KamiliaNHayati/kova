# Kova Agent

Kova is a decentralized autonomous agent architecture using the Stacks blockchain and x402 payment protocols.

## Security & Architecture Notes
This repository contains a demo environment for the Kova agent. Key security implementations include:
- **Operator-Paid Model:** Escrow-based billing ensuring operators pay gas fees natively on-chain.
- **Nonce-based Signature Verification:** All API modifications map back to native Stacks signatures tied to the Owner's Principal, strictly preventing replay attacks.
- **Off-chain Locks:** Node.js memory sets that instantly block duplicate executions and race-condition vulnerabilities.

### Rotating the Heartbeat Secret 🔄
For Demo scaling and rapid index validation, the Agent and Frontend coordinate via a shared secret to populate the Dashboard's "Agent Running" indicators.

**To manually rotate this secret:**
1. Open `kova/demo/agent/.env`.
2. Locate the line containing `HEARTBEAT_SECRET`.
3. Change its value to a new cryptographically secure string (e.g. `HEARTBEAT_SECRET=my-new-secure-uuid`).
4. Restart your `node agent.js` process so that the `.env` changes are picked up.
*(If you do not set an environment variable, the agent defaults to `"kova-demo-secret"`).*

## Audit Logs
Whenever a transaction succeeds (e.g. Deposit, Withdraw, Allow Service, Operator Register), the frontend asynchronously pushes a JSON trace to `kova/demo/agent/audit.log`. Review this file for a simplified temporal timeline of agent operations!
