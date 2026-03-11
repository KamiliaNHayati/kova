import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // owner
const wallet2 = accounts.get("wallet_2")!; // agent (operator)
const wallet3 = accounts.get("wallet_3")!; // service
const wallet4 = accounts.get("wallet_4")!; // unauthorized / second agent
const wallet5 = accounts.get("wallet_5")!; // third agent

const CONTRACT = "agent-wallet-v2";

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
  // Deposit STX into escrow
  if (depositAmount > 0) {
    simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.uint(depositAmount)],
      owner
    );
  }
  // Allow wallet3 as service
  simnet.callPublicFn(
    CONTRACT,
    "allow-service",
    [Cl.standardPrincipal(wallet3)],
    owner
  );
}

// ═══════════════════════════════════════════════
// create-wallet
// ═══════════════════════════════════════════════
describe("create-wallet", () => {
  it("creates a wallet with balance 0", () => {
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
      [Cl.standardPrincipal(wallet1)],
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

    // Agent should be authorized
    const authorized = simnet.callReadOnlyFn(
      CONTRACT,
      "is-agent-authorized",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(authorized.result).toBeBool(true);

    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-agent-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(1);
  });

  it("rejects duplicate wallet creation", () => {
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

  it("rejects zero per-call limit", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-wallet",
      [Cl.standardPrincipal(wallet2), Cl.uint(1000), Cl.uint(0)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(110));
  });
});

// ═══════════════════════════════════════════════
// deposit & withdraw
// ═══════════════════════════════════════════════
describe("deposit-withdraw", () => {
  it("deposit increases escrow balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0); // no deposit yet
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.uint(5000)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(balance.result).toBeUint(5000);
  });

  it("multiple deposits accumulate", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0);
    simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1000)], wallet1);
    simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(2000)], wallet1);

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(balance.result).toBeUint(3000);
  });

  it("deposit rejects zero amount", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 0);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.uint(0)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(109));
  });

  it("deposit rejects without wallet", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "deposit",
      [Cl.uint(1000)],
      wallet4 // no wallet
    );
    expect(result).toBeErr(Cl.uint(103));
  });

  it("withdraw decreases escrow balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.uint(2000)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(balance.result).toBeUint(3000);
  });

  it("withdraw rejects insufficient balance", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 1000);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.uint(5000)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(104));
  });

  it("withdraw rejects zero amount", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "withdraw",
      [Cl.uint(0)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(109));
  });
});

// ═══════════════════════════════════════════════
// agent-pay (core autonomous function)
// ═══════════════════════════════════════════════
describe("agent-pay", () => {
  it("pays service from escrow and logs spend", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet2 // agent
    );
    expect(result).toBeOk(Cl.bool(true));

    // Balance should decrease
    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(balance.result).toBeUint(4950);

    // Daily counter should increase
    const spent = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spent-today",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(spent.result).toBeUint(50);

    // Nonce should increment
    const nonce = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(nonce.result).toBeUint(1);

    // Spend log should exist
    const log = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet1), Cl.uint(0)],
      wallet1
    );
    expect(log.result).toBeSome(
      Cl.tuple({
        agent: Cl.standardPrincipal(wallet2),
        service: Cl.standardPrincipal(wallet3),
        amount: Cl.uint(50),
        block: Cl.uint(simnet.burnBlockHeight),
      })
    );
  });

  it("rejects unauthorized agent", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet4 // not authorized
    );
    expect(result).toBeErr(Cl.uint(101));
  });

  it("rejects inactive wallet (kill switch)", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "set-active", [Cl.bool(false)], wallet1);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(107));
  });

  it("rejects insufficient escrow balance", () => {
    setupWallet(wallet1, wallet2, 10000, 10000, 100); // only 100 deposited
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(500)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(104));
  });

  it("rejects non-allowlisted service", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet4), Cl.uint(50)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(108));
  });

  it("rejects amount exceeding per-call limit", () => {
    setupWallet(); // per-call = 100
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(150)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(106));
  });

  it("rejects amount exceeding daily limit", () => {
    setupWallet(wallet1, wallet2, 200, 100, 5000);
    // Pay 100
    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    // Pay 100 more = exactly 200, should pass
    const ok = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    expect(ok.result).toBeOk(Cl.bool(true));

    // Pay 1 more = 201 > 200 daily limit
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(1)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(105));
  });

  it("rejects zero amount", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(0)],
      wallet2
    );
    expect(result).toBeErr(Cl.uint(109));
  });

  it("multiple agent-pays accumulate counters", () => {
    setupWallet(wallet1, wallet2, 500, 100, 5000);
    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        CONTRACT,
        "agent-pay",
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
        wallet2
      );
    }
    const spent = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spent-today",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(spent.result).toBeUint(150);

    const balance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(balance.result).toBeUint(4850);

    const nonce = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(nonce.result).toBeUint(3);
  });

  it("daily limit shared across agents", () => {
    setupWallet(wallet1, wallet2, 150, 100, 5000);
    simnet.callPublicFn(CONTRACT, "add-agent", [Cl.standardPrincipal(wallet4)], wallet1);

    // Agent 1 pays 100
    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    // Agent 2 tries to pay 100 (total 200 > 150)
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet4
    );
    expect(result).toBeErr(Cl.uint(105));
  });
});

// ═══════════════════════════════════════════════
// validate-spend (pre-flight check)
// ═══════════════════════════════════════════════
describe("validate-spend", () => {
  it("returns ok for valid spend", () => {
    setupWallet();
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet2
    );
    expect(result.result).toBeOk(Cl.bool(true));
  });

  it("rejects insufficient balance", () => {
    setupWallet(wallet1, wallet2, 10000, 10000, 100);
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(500)],
      wallet2
    );
    expect(result.result).toBeErr(Cl.uint(104));
  });
});

// ═══════════════════════════════════════════════
// Multi-agent management
// ═══════════════════════════════════════════════
describe("multi-agent", () => {
  it("add-agent adds a second agent", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "add-agent",
      [Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    const auth = simnet.callReadOnlyFn(
      CONTRACT,
      "is-agent-authorized",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(auth.result).toBeBool(true);

    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-agent-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(2);
  });

  it("second agent can agent-pay", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "add-agent", [Cl.standardPrincipal(wallet4)], wallet1);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet4
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("remove-agent revokes authorization", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "add-agent", [Cl.standardPrincipal(wallet4)], wallet1);
    simnet.callPublicFn(CONTRACT, "remove-agent", [Cl.standardPrincipal(wallet4)], wallet1);

    const { result } = simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet4
    );
    expect(result).toBeErr(Cl.uint(101));
  });

  it("rejects adding duplicate agent", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "add-agent",
      [Cl.standardPrincipal(wallet2)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(113));
  });

  it("rejects removing non-existent agent", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "remove-agent",
      [Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(114));
  });
});

// ═══════════════════════════════════════════════
// Owner management
// ═══════════════════════════════════════════════
describe("owner-management", () => {
  it("set-active toggles kill switch", () => {
    setupWallet();
    simnet.callPublicFn(CONTRACT, "set-active", [Cl.bool(false)], wallet1);
    const wallet = simnet.callReadOnlyFn(CONTRACT, "get-wallet", [Cl.standardPrincipal(wallet1)], wallet1);
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

  it("set-limits updates limits", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-limits",
      [Cl.uint(5000), Cl.uint(500)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("set-limits rejects invalid", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-limits",
      [Cl.uint(100), Cl.uint(200)],
      wallet1
    );
    expect(result).toBeErr(Cl.uint(110));
  });

  it("set-agent adds agent (backwards compat)", () => {
    setupWallet();
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-agent",
      [Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result).toBeOk(Cl.bool(true));

    // Both agents should work
    const v1 = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet2
    );
    expect(v1.result).toBeOk(Cl.bool(true));
    const v2 = simnet.callReadOnlyFn(
      CONTRACT,
      "validate-spend",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(50)],
      wallet4
    );
    expect(v2.result).toBeOk(Cl.bool(true));
  });

  it("allow-service and disallow-service", () => {
    setupWallet();
    let allowed = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3)],
      wallet1
    );
    expect(allowed.result).toBeBool(true);

    simnet.callPublicFn(CONTRACT, "disallow-service", [Cl.standardPrincipal(wallet3)], wallet1);
    allowed = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3)],
      wallet1
    );
    expect(allowed.result).toBeBool(false);
  });

  it("management rejects without wallet", () => {
    const r1 = simnet.callPublicFn(CONTRACT, "set-active", [Cl.bool(false)], wallet4);
    expect(r1.result).toBeErr(Cl.uint(103));
    const r2 = simnet.callPublicFn(CONTRACT, "set-limits", [Cl.uint(100), Cl.uint(50)], wallet4);
    expect(r2.result).toBeErr(Cl.uint(103));
    const r3 = simnet.callPublicFn(CONTRACT, "set-agent", [Cl.standardPrincipal(wallet2)], wallet4);
    expect(r3.result).toBeErr(Cl.uint(103));
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
      [Cl.standardPrincipal(wallet4)],
      wallet4
    );
    expect(result.result).toBeUint(0);
  });

  it("get-daily-remaining returns remaining", () => {
    setupWallet(wallet1, wallet2, 1000, 100, 5000);
    // Spend 300
    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    simnet.callPublicFn(
      CONTRACT,
      "agent-pay",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet3), Cl.uint(100)],
      wallet2
    );
    const remaining = simnet.callReadOnlyFn(
      CONTRACT,
      "get-daily-remaining",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(remaining.result).toBeUint(700); // 1000 - 300
  });

  it("get-spend-nonce returns 0 for no spends", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-nonce",
      [Cl.standardPrincipal(wallet4)],
      wallet4
    );
    expect(result.result).toBeUint(0);
  });

  it("get-spend-record returns none for no record", () => {
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "get-spend-record",
      [Cl.standardPrincipal(wallet4), Cl.uint(0)],
      wallet4
    );
    expect(result.result).toBeNone();
  });

  it("is-service-allowed returns false for unknown", () => {
    setupWallet();
    const result = simnet.callReadOnlyFn(
      CONTRACT,
      "is-service-allowed",
      [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet4)],
      wallet1
    );
    expect(result.result).toBeBool(false);
  });
});
