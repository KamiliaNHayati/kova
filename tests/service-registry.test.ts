import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const CONTRACT = "service-registry-v2";

describe("register-service", () => {
  it("registers a new service and returns index 0", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "register-service",
      [
        Cl.stringAscii("summarizer"),
        Cl.stringAscii("AI text summarization service"),
        Cl.stringAscii("https://api.example.com/summarize"),
        Cl.uint(10),
      ],
      wallet1
    );
    expect(result).toBeOk(Cl.uint(0)); // first index is 0

    // Verify service was stored
    const service = simnet.callReadOnlyFn(
      CONTRACT,
      "get-user-service",
      [Cl.standardPrincipal(wallet1), Cl.uint(0)],
      wallet1
    );
    expect(service.result).toBeSome(
      Cl.tuple({
        name: Cl.stringAscii("summarizer"),
        description: Cl.stringAscii("AI text summarization service"),
        url: Cl.stringAscii("https://api.example.com/summarize"),
        "price-per-call": Cl.uint(10),
        active: Cl.bool(true),
      })
    );

    // Verify count is 1
    const count = simnet.callReadOnlyFn(
      CONTRACT,
      "get-service-count",
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(1);
  });

  it("increments index for each new service", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("service-a"), Cl.stringAscii("First"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("service-b"), Cl.stringAscii("Second"), Cl.stringAscii("https://b.com"), Cl.uint(20)],
      wallet1);
    expect(result).toBeOk(Cl.uint(1)); // second index is 1

    const count = simnet.callReadOnlyFn(CONTRACT, "get-service-count",
      [Cl.standardPrincipal(wallet1)], wallet1);
    expect(count.result).toBeUint(2);
  });

  it("different users have independent indexes", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("From wallet1"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("From wallet2"), Cl.stringAscii("https://b.com"), Cl.uint(20)],
      wallet2);
    expect(result).toBeOk(Cl.uint(0)); // wallet2's first service is index 0

    // Each user has count 1
    const c1 = simnet.callReadOnlyFn(CONTRACT, "get-service-count",
      [Cl.standardPrincipal(wallet1)], wallet1);
    expect(c1.result).toBeUint(1);

    const c2 = simnet.callReadOnlyFn(CONTRACT, "get-service-count",
      [Cl.standardPrincipal(wallet2)], wallet2);
    expect(c2.result).toBeUint(1);
  });

  it("rejects empty name", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii(""), Cl.stringAscii("No name"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);
    expect(result).toBeErr(Cl.uint(204)); // ERR-EMPTY-NAME
  });

  it("rejects zero price", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("Free"), Cl.stringAscii("https://a.com"), Cl.uint(0)],
      wallet1);
    expect(result).toBeErr(Cl.uint(203)); // ERR-ZERO-PRICE
  });

  it("rejects empty URL", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("desc"), Cl.stringAscii(""), Cl.uint(10)],
      wallet1);
    expect(result).toBeErr(Cl.uint(205)); // ERR-EMPTY-URL
  });

  it("allows registering more than 5 services (unlimited)", () => {
    // Register 7 services
    for (let i = 0; i < 7; i++) {
      const r = simnet.callPublicFn(CONTRACT, "register-service",
        [Cl.stringAscii(`svc-${i}`), Cl.stringAscii("desc"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
        wallet1);
      expect(r.result).toBeOk(Cl.uint(i));
    }

    // Count should be 7
    const count = simnet.callReadOnlyFn(CONTRACT, "get-service-count",
      [Cl.standardPrincipal(wallet1)], wallet1);
    expect(count.result).toBeUint(7);
  });
});

describe("update-service", () => {
  it("owner updates price by index", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("summarizer"), Cl.stringAscii("AI summarizer"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "update-price",
      [Cl.uint(0), Cl.uint(25)], wallet1);
    expect(result).toBeOk(Cl.bool(true));

    // Verify updated price
    const service = simnet.callReadOnlyFn(CONTRACT, "get-user-service",
      [Cl.standardPrincipal(wallet1), Cl.uint(0)], wallet1);
    expect(service.result).toBeSome(
      Cl.tuple({
        name: Cl.stringAscii("summarizer"),
        description: Cl.stringAscii("AI summarizer"),
        url: Cl.stringAscii("https://a.com"),
        "price-per-call": Cl.uint(25),
        active: Cl.bool(true),
      })
    );
  });

  it("non-owner cannot update price (different map key)", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("summarizer"), Cl.stringAscii("AI summarizer"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    // wallet2 tries to update wallet1's service at index 0
    const { result } = simnet.callPublicFn(CONTRACT, "update-price",
      [Cl.uint(0), Cl.uint(25)], wallet2);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND (no service at wallet2/index 0)
  });

  it("owner updates URL by index", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("summarizer"), Cl.stringAscii("AI summarizer"), Cl.stringAscii("https://old.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "update-url",
      [Cl.uint(0), Cl.stringAscii("https://new.com")], wallet1);
    expect(result).toBeOk(Cl.bool(true));
  });

  it("non-owner cannot update URL", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("desc"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "update-url",
      [Cl.uint(0), Cl.stringAscii("https://evil.com")], wallet2);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });
});

describe("activate/deactivate", () => {
  it("owner deactivates and reactivates service by index", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("summarizer"), Cl.stringAscii("AI summarizer"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    // Deactivate
    simnet.callPublicFn(CONTRACT, "deactivate-service", [Cl.uint(0)], wallet1);
    let service = simnet.callReadOnlyFn(CONTRACT, "get-user-service",
      [Cl.standardPrincipal(wallet1), Cl.uint(0)], wallet1);
    expect(service.result).toBeSome(
      Cl.tuple({
        name: Cl.stringAscii("summarizer"),
        description: Cl.stringAscii("AI summarizer"),
        url: Cl.stringAscii("https://a.com"),
        "price-per-call": Cl.uint(10),
        active: Cl.bool(false),
      })
    );

    // Reactivate
    simnet.callPublicFn(CONTRACT, "activate-service", [Cl.uint(0)], wallet1);
    service = simnet.callReadOnlyFn(CONTRACT, "get-user-service",
      [Cl.standardPrincipal(wallet1), Cl.uint(0)], wallet1);
    expect(service.result).toBeSome(
      Cl.tuple({
        name: Cl.stringAscii("summarizer"),
        description: Cl.stringAscii("AI summarizer"),
        url: Cl.stringAscii("https://a.com"),
        "price-per-call": Cl.uint(10),
        active: Cl.bool(true),
      })
    );
  });

  it("non-owner cannot deactivate (different map key)", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("summarizer"), Cl.stringAscii("AI summarizer"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "deactivate-service",
      [Cl.uint(0)], wallet2);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });

  it("non-owner cannot activate (different map key)", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("desc"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);
    simnet.callPublicFn(CONTRACT, "deactivate-service", [Cl.uint(0)], wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "activate-service",
      [Cl.uint(0)], wallet2);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });
});

// ═══════════════════════════════════════════════
// Negative Tests — Service Registry
// ═══════════════════════════════════════════════
describe("negative-tests", () => {
  it("rejects update-price on nonexistent index", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "update-price",
      [Cl.uint(99), Cl.uint(50)], wallet1);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });

  it("rejects update-url on nonexistent index", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "update-url",
      [Cl.uint(99), Cl.stringAscii("https://new.com")], wallet1);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });

  it("rejects deactivate on nonexistent index", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "deactivate-service",
      [Cl.uint(99)], wallet1);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });

  it("rejects activate on nonexistent index", () => {
    const { result } = simnet.callPublicFn(CONTRACT, "activate-service",
      [Cl.uint(99)], wallet1);
    expect(result).toBeErr(Cl.uint(202)); // ERR-SERVICE-NOT-FOUND
  });

  it("rejects zero price on update-price", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("desc"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "update-price",
      [Cl.uint(0), Cl.uint(0)], wallet1);
    expect(result).toBeErr(Cl.uint(203)); // ERR-ZERO-PRICE
  });

  it("rejects empty URL on update-url", () => {
    simnet.callPublicFn(CONTRACT, "register-service",
      [Cl.stringAscii("svc"), Cl.stringAscii("desc"), Cl.stringAscii("https://a.com"), Cl.uint(10)],
      wallet1);

    const { result } = simnet.callPublicFn(CONTRACT, "update-url",
      [Cl.uint(0), Cl.stringAscii("")], wallet1);
    expect(result).toBeErr(Cl.uint(205)); // ERR-EMPTY-URL
  });

  it("get-user-service returns none for nonexistent index", () => {
    const result = simnet.callReadOnlyFn(CONTRACT, "get-user-service",
      [Cl.standardPrincipal(wallet1), Cl.uint(99)], wallet1);
    expect(result.result).toBeNone();
  });

  it("get-service-count returns 0 for user with no services", () => {
    const result = simnet.callReadOnlyFn(CONTRACT, "get-service-count",
      [Cl.standardPrincipal(wallet2)], wallet2);
    expect(result.result).toBeUint(0);
  });
});
