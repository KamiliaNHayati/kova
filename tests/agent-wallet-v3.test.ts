import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // owner
const wallet2 = accounts.get("wallet_2")!; // agent 1
const wallet3 = accounts.get("wallet_3")!; // service
const wallet4 = accounts.get("wallet_4")!; // agent 2 / operator
const wallet5 = accounts.get("wallet_5")!; // unauthorized

const CONTRACT = "agent-wallet-v3";

// ═══════════════════════════════════════════════
// Helper: setup a standard wallet + deposit + allow service
// ═══════════════════════════════════════════════
function setupWallet(
  owner = wallet1,
  agent = wallet2,
  dailyLimit = 1000,
  perCallLimit = 100,
  depositAmount = 5000
) {
  simnet.callPublicFn(
    CONTRACT,
    "create-wallet",
    [Cl.standardPrincipal(agent), Cl.uint(dailyLimit), Cl.uint(perCallLimit)],
    owner
  );
  // Deposit STX into agent's escrow
  if (depositAmount > 0) {
    simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.standardPrincipal(agent), Cl.uint(depositAmount)],
      owner
    );
  }
  // Allow wallet3 as service for this agent
  simnet.callPublicFn(
    CONTRACT,
    "allow-service",
    [Cl.standardPrincipal(agent), Cl.standardPrincipal(wallet3)],
    owner
  );
}

// Helper: register an operator for an owner
function registerOperator(owner = wallet1, operator = wallet4) {
  simnet.callPublicFn(
    CONTRACT,
    "register-operator",
    [Cl.standardPrincipal(operator)],
    owner
  );
}

// ═══════════════════════════════════════════════
// create-wallet
// ═══════════════════════════════════════════════
describe("create-wallet", () => {
  it("creates an isolated wallet for an agent with balance 0", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000), Cl.uint(100)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const wallet = simnet.callReadOnlyFn(
      CONTRACT,
      "get-wallet",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(wallet.result).toBeSome(
      Cl.tuple({
        balance: Cl.uint(0),
        "daily-limit": Cl.uint(1000),
        "per-call-limit": Cl.uint(100),
        "spent-today": Cl.uint(0),
        "last-reset-block": Cl.uint(simnet.burnBlockHeight),
        active: Cl.bool(true),
      })
    );

    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-agent-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(1);
  });

  it("rejects duplicate wallet creation for the same agent", () => {
    simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000), Cl.uint(100)],
      wallet1
    );
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000), Cl.uint(100)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(102));
  });

  it("allows creating wallets for multiple agents", () => {
    simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000), Cl.uint(100)],
      wallet1
    );
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet4), Cl.uint(2000), Cl.uint(200)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-agent-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(2);
  });

  it("rejects zero daily limit", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(0), Cl.uint(100)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(110));
  });

  it("rejects per-call limit greater than daily limit", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(100), Cl.uint(200)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(110));
  });
});

// ═══════════════════════════════════════════════
// deposit & withdraw
// ═══════════════════════════════════════════════
describe("deposit-withdraw", () => {
  it("deposit increases agent's isolated escrow balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0); 
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.standardPrincipal(wallet2), Cl.uint(5000)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(balance.result).toBeUint(5000);
  });

  it("deposit to different agents remains isolated", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0); 
    setupWallet(wallet1, wallet4, 1000, 100, 0); 

    simnet.callPublicFn(CONTRACT, "deposit", [Cl.standardPrincipal(wallet2), Cl.uint(1000)], wallet1);
    simnet.callPublicFn(CONTRACT, "deposit", [Cl.standardPrincipal(wallet4), Cl.uint(5000)], wallet1);

    const balance2 = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    const balance4 = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(balance2.result).toBeUint(1000);
    expect(balance4.result).toBeUint(5000);
  });

  it("deposit rejects zero amount", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.standardPrincipal(wallet2), Cl.uint(0)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(109));
  });

  it("deposit rejects without wallet", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000)],
      wallet1 // no wallet created
    );
    expect(result).toBeErr(Cl.uint(103));
  });

  it("withdraw decreases agent's escrow balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.standardPrincipal(wallet2), Cl.uint(2000)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(balance.result).toBeUint(3000);
  });

  it("withdraw rejects insufficient balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 1000);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.standardPrincipal(wallet2), Cl.uint(5000)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(104));
  });
});

// ═══════════════════════════════════════════════
// Operator management
// ═══════════════════════════════════════════════
describe("operator-management", () => {
  it("owner registers an operator", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "register-operator",
      [Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const op = simnet.callReadOnlyFn(
      CONTRACT,
      "get-operator",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(op.result).toBeSome(
      Cl.tuple({ operator: Cl.standardPrincipal(wallet4) })
    );
  });

  it("owner revokes operator", () => {
    registerOperator(wallet1, wallet4);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "revoke-operator",
      [],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const op = simnet.callReadOnlyFn(
      CONTRACT,
      "get-operator",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(op.result).toBeNone();
  });

  it("revoke-operator fails when no operator is set", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "revoke-operator",
      [],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(117)); // ERR-NO-OPERATOR
  });

  it("owner can replace operator by re-registering", () => {
    registerOperator(wallet1, wallet4);
    registerOperator(wallet1, wallet5);

    const op = simnet.callReadOnlyFn(
      CONTRACT,
      "get-operator",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(op.result).toBeSome(
      Cl.tuple({ operator: Cl.standardPrincipal(wallet5) })
    );
  });
});

// ═══════════════════════════════════════════════
// agent-pay (operator-paid model)
// ═══════════════════════════════════════════════
describe("agent-pay", () => {
  it("operator pays service from agent's escrow and logs spend with fee", () => {
    setupWallet(); // owner=wallet1, agent=wallet2
    registerOperator(wallet1, wallet4); // wallet4 = operator

    // agent-pay called by operator (wallet4)
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),  // owner
        Cl.standardPrincipal(wallet2),  // agent
        Cl.standardPrincipal(wallet3),  // service
        Cl.uint(50),                    // amount
      ],
      wallet4 // operator signs
    );
    expect(result).toBeOk(Cl.bool(true));

    // Balance should decrease by full amount (50)
    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(balance.result).toBeUint(4950);

    // Spent today = 50
    const spent = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spent-today",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(spent.result).toBeUint(50);

    // Nonce = 1
    const nonce = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(nonce.result).toBeUint(1);

    // Spend log includes fee field
    // fee = (50 * 200) / 10000 = 1
    const log = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(0)],
      wallet1
    );
    expect(log.result).toBeSome(
      Cl.tuple({
        service: Cl.standardPrincipal(wallet3),
        amount: Cl.uint(50),
        fee: Cl.uint(1),
        block: Cl.uint(simnet.burnBlockHeight),
      })
    );
  });

  it("platform fee calculation: remainder goes to service", () => {
    // Test with amount that causes truncation: 33 * 200 / 10000 = 0.66 → truncates to 0
    // So service gets 33, platform gets 0
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    registerOperator(wallet1, wallet4);

    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(33),
      ],
      wallet4
    );

    const log = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(0)],
      wallet1
    );
    // fee = (33 * 200) / 10000 = 6600 / 10000 = 0 (truncated)
    expect(log.result).toBeSome(
      Cl.tuple({
        service: Cl.standardPrincipal(wallet3),
        amount: Cl.uint(33),
        fee: Cl.uint(0),
        block: Cl.uint(simnet.burnBlockHeight),
      })
    );
  });

  it("platform fee with larger amount: 1000 -> fee=20, service=980", () => {
    setupWallet(wallet1, wallet2, 5000, 1000, 10000);
    registerOperator(wallet1, wallet4);

    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(1000),
      ],
      wallet4
    );

    const log = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(0)],
      wallet1
    );
    // fee = (1000 * 200) / 10000 = 20
    expect(log.result).toBeSome(
      Cl.tuple({
        service: Cl.standardPrincipal(wallet3),
        amount: Cl.uint(1000),
        fee: Cl.uint(20),
        block: Cl.uint(simnet.burnBlockHeight),
      })
    );

    // Agent balance decreased by full 1000
    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(balance.result).toBeUint(9000);
  });

  it("rejects unregistered operator (ERR-NOT-AUTHORIZED)", () => {
    setupWallet(); // wallet created for wallet2
    // No operator registered

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(50),
      ],
      wallet4 // not a registered operator
    );
    expect(result).toBeErr(Cl.uint(118)); // ERR-NOT-AUTHORIZED
  });

  it("rejects wrong operator (registered for different owner)", () => {
    setupWallet();
    // Register operator for wallet5 (NOT wallet1)
    registerOperator(wallet5, wallet4);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(50),
      ],
      wallet4 // operator for wallet5, not wallet1
    );
    expect(result).toBeErr(Cl.uint(118)); // ERR-NOT-AUTHORIZED
  });

  it("rejects agent as caller when ALLOW_AGENT_CALLERS is false", () => {
    setupWallet();
    // agent (wallet2) tries to call agent-pay directly — should fail
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(50),
      ],
      wallet2 // agent tries to call (not authorized in operator-only mode)
    );
    expect(result).toBeErr(Cl.uint(118)); // ERR-NOT-AUTHORIZED
  });

  it("rejects inactive wallet (kill switch)", () => {
    setupWallet();
    registerOperator(wallet1, wallet4);
    simnet.callPublicFn(CONTRACT, "set-active", [Cl.standardPrincipal(wallet2), Cl.bool(false)], wallet1);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(50),
      ],
      wallet4
    );
    expect(result).toBeErr(Cl.uint(107));
  });

  it("rejects insufficient escrow balance", () => {
    setupWallet(wallet1, wallet2, 10000, 10000, 100);
    registerOperator(wallet1, wallet4);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(500),
      ],
      wallet4
    );
    expect(result).toBeErr(Cl.uint(104));
  });

  it("rejects non-allowlisted service", () => {
    setupWallet();
    registerOperator(wallet1, wallet4);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet5), // not allowlisted
        Cl.uint(50),
      ],
      wallet4
    );
    expect(result).toBeErr(Cl.uint(108));
  });

  it("multiple agent-pays accumulate counters", () => {
    setupWallet(wallet1, wallet2, 500, 100, 5000);
    registerOperator(wallet1, wallet4);

    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        CONTRACT,
        "agent-pay",
        [
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.standardPrincipal(wallet3),
          Cl.uint(50),
        ],
        wallet4
      );
    }

    const spent = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spent-today",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(spent.result).toBeUint(150);

    const nonce = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(nonce.result).toBeUint(3);
  });
});

// ═══════════════════════════════════════════════
// Owner management
// ═══════════════════════════════════════════════
describe("owner-management", () => {
  it("remove-agent rejects when balance > 0", () => {
    setupWallet(); // deposits 5000

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "remove-agent",
      [Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(104)); // ERR-INSUFFICIENT-BALANCE
  });

  it("remove-agent succeeds after withdrawing all funds", () => {
    setupWallet();

    // Withdraw all funds first
    simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.standardPrincipal(wallet2), Cl.uint(5000)],
      wallet1
    );

    // Now remove-agent should succeed
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "remove-agent",
      [Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-agent-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(0);
  });

  it("remove-agent succeeds when created with zero deposit", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "remove-agent",
      [Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("allow-service and disallow-service per-agent", () => {
    setupWallet();
    let allowed = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet3)],
      wallet1
    );
    expect(allowed.result).toBeBool(true);

    simnet.callPublicFn(CONTRACT, "disallow-service", [Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet3)], wallet1);
    allowed = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet3)],
      wallet1
    );
    expect(allowed.result).toBeBool(false);
  });
});

// ═══════════════════════════════════════════════
// validate-spend (pre-flight check — explicit agent param)
// ═══════════════════════════════════════════════
describe("validate-spend", () => {
  it("returns ok for valid spend", () => {
    setupWallet();
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [
        Cl.standardPrincipal(wallet1),  // owner
        Cl.standardPrincipal(wallet2),  // agent (explicit)
        Cl.standardPrincipal(wallet3),  // service
        Cl.uint(50),
      ],
      wallet4 // anyone can call read-only
    );
    expect(result.result).toBeOk(Cl.bool(true));
  });

  it("rejects insufficient balance", () => {
    setupWallet(wallet1, wallet2, 10000, 10000, 100);
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(500),
      ],
      wallet4
    );
    expect(result.result).toBeErr(Cl.uint(104));
  });

  it("rejects inactive wallet", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "set-active", [Cl.standardPrincipal(wallet2), Cl.bool(false)], wallet1);

    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [
        Cl.standardPrincipal(wallet1),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(wallet3),
        Cl.uint(50),
      ],
      wallet4
    );
    expect(result.result).toBeErr(Cl.uint(107)); // ERR-WALLET-INACTIVE
  });
});

// ═══════════════════════════════════════════════
// Limits and Active settings
// ═══════════════════════════════════════════════
describe("limits-and-active", () => {
  it("set-active toggles kill switch for specific agent", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "set-active", [Cl.standardPrincipal(wallet2), Cl.bool(false)], wallet1);
    const wallet = simnet.callReadOnlyFn(CONTRACT, "get-wallet", [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)], wallet1);
    const w = wallet.result;
    expect(w).toBeSome(Cl.tuple({
      balance: Cl.uint(5000),
      "daily-limit": Cl.uint(1000),
      "per-call-limit": Cl.uint(100),
      "spent-today": Cl.uint(0),
      "last-reset-block": Cl.uint(simnet.burnBlockHeight),
      active: Cl.bool(false),
    }));
  });

  it("set-limits updates limits for specific agent", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-limits",
      [Cl.standardPrincipal(wallet2), Cl.uint(5000), Cl.uint(500)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("set-limits rejects invalid limits", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-limits",
      [Cl.standardPrincipal(wallet2), Cl.uint(100), Cl.uint(200)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(110)); // per-call > daily
  });

  it("management rejects without owner signature", () => {
    const r1 = simnet.callPublicFn(CONTRACT, "set-active", [Cl.standardPrincipal(wallet2), Cl.bool(false)], wallet4);
    expect(r1.result).toBeErr(Cl.uint(103)); // ERR-NO-WALLET since it looks up {caller, agent}
  });
});

// ═══════════════════════════════════════════════
// Read-only helpers
// ═══════════════════════════════════════════════
describe("read-only-helpers", () => {
  it("get-balance returns 0 for no wallet", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet4), Cl.standardPrincipal(wallet4)],
      wallet4
    );
    expect(result.result).toBeUint(0);
  });

  it("get-daily-remaining returns remaining for specific agent", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    registerOperator(wallet1, wallet4);

    // Spend 300 via operator
    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        CONTRACT,
        "agent-pay",
        [
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.standardPrincipal(wallet3),
          Cl.uint(100),
        ],
        wallet4
      );
    }

    const remaining = simnet.callReadOnlyFn(
      CONTRACT,
      "get-daily-remaining",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(remaining.result).toBeUint(700); // 1000 - 300
  });

  it("get-spend-nonce returns 0 for no spends", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet4), Cl.standardPrincipal(wallet4)],
      wallet4
    );
    expect(result.result).toBeUint(0);
  });

  it("get-spend-record returns none for no record", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet4), Cl.standardPrincipal(wallet4), Cl.uint(0)],
      wallet4
    );
    expect(result.result).toBeNone();
  });

  it("is-service-allowed returns false for unknown", () => {
    setupWallet();
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result.result).toBeBool(false);
  });

  it("get-platform-address returns deployer", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-platform-address",
      [],
      wallet1
    );
    expect(result.result).toStrictEqual(Cl.standardPrincipal(deployer));
  });

  it("get-platform-fee-bps returns 200", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-platform-fee-bps",
      [],
      wallet1
    );
    expect(result.result).toBeUint(200);
  });
});

// ═══════════════════════════════════════════════
// Platform admin
// ═══════════════════════════════════════════════
describe("platform-admin", () => {
  it("deployer can change platform address", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-platform-address",
      [Cl.standardPrincipal(wallet5)],
      deployer
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("non-admin cannot change platform address", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-platform-address",
      [Cl.standardPrincipal(wallet5)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(116)); // ERR-NOT-ADMIN
  });
});
