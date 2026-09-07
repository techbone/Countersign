import { describe, expect, it } from "vitest";

import { evaluate, resolveNotionalUsd, type EvaluateArgs } from "./policy";
import { DEFAULT_POLICY, type RiskState, type TradeIntent } from "./types";

const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);
const MARK = 80_000;

function risk(overrides: Partial<RiskState> = {}): RiskState {
  return {
    halted: false,
    dayKey: "2026-09-07",
    sessionStartEquity: 1000,
    peakEquity: 1000,
    currentEquity: 1000,
    realizedPnlToday: 0,
    dailyNotionalUsd: 0,
    positions: {},
    ...overrides,
  };
}

function intent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return {
    venue: "spot",
    symbol: "BTCUSDT",
    side: "BUY",
    orderType: "MARKET",
    quoteOrderQty: 10,
    rationale: "test",
    ...overrides,
  };
}

/** Evaluate with sensible defaults; override only what a test cares about. */
function run(args: Partial<EvaluateArgs> = {}) {
  return evaluate({
    intent: intent(),
    policy: { ...DEFAULT_POLICY },
    risk: risk(),
    market: { markPrice: MARK, volatility1hPct: 0.5 },
    acceptedTradeTimes: [],
    now: NOW,
    ...args,
  });
}

const ruleOf = (result: ReturnType<typeof run>, id: string) => {
  const rule = result.rules.find((r) => r.id === id);
  if (!rule) throw new Error(`no rule ${id}`);
  return rule;
};

describe("notional resolution", () => {
  it("prefers an explicit quote amount", () => {
    expect(resolveNotionalUsd(intent({ quoteOrderQty: 25 }), MARK)).toBe(25);
  });

  it("prices base quantity at the mark when no limit price is given", () => {
    const value = resolveNotionalUsd(
      intent({ quantity: 0.001, quoteOrderQty: undefined }),
      MARK,
    );
    expect(value).toBeCloseTo(80);
  });

  it("prices base quantity at the limit price when one is given", () => {
    const value = resolveNotionalUsd(
      intent({
        quantity: 0.001,
        quoteOrderQty: undefined,
        orderType: "LIMIT",
        price: 70_000,
      }),
      MARK,
    );
    expect(value).toBeCloseTo(70);
  });
});

describe("baseline", () => {
  it("allows a small compliant trade and runs every rule", () => {
    const result = run();
    expect(result.decision).toBe("ALLOW");
    expect(result.rules).toHaveLength(15);
    expect(result.rules.filter((r) => r.status === "block")).toHaveLength(0);
  });

  it("is deterministic — identical inputs give an identical verdict", () => {
    expect(run()).toEqual(run());
  });

  it("never short-circuits: a blocked trade still reports all 15 rules", () => {
    const result = run({ intent: intent({ quoteOrderQty: 10_000 }) });
    expect(result.decision).toBe("BLOCK");
    expect(result.rules).toHaveLength(15);
  });
});

describe("hard blocks", () => {
  it("blocks everything while halted", () => {
    const result = run({ risk: risk({ halted: true, haltReason: "breaker" }) });
    expect(result.decision).toBe("BLOCK");
    expect(ruleOf(result, "kill-switch").status).toBe("block");
  });

  it("blocks a symbol that is not on the allowlist", () => {
    const result = run({ intent: intent({ symbol: "DOGEUSDT" }) });
    expect(ruleOf(result, "symbol-allowlist").status).toBe("block");
    expect(result.decision).toBe("BLOCK");
  });

  it("is case-insensitive about the symbol", () => {
    const result = run({ intent: intent({ symbol: "btcusdt" }) });
    expect(ruleOf(result, "symbol-allowlist").status).toBe("pass");
  });

  it("blocks a venue that is not permitted", () => {
    const result = run({ intent: intent({ venue: "usdm-futures" }) });
    expect(ruleOf(result, "venue").status).toBe("block");
  });

  it("blocks a trade over the per-trade notional cap", () => {
    const result = run({ intent: intent({ quoteOrderQty: 26 }) });
    expect(ruleOf(result, "max-notional").status).toBe("block");
  });

  it("blocks a trade that would exceed the daily budget", () => {
    const result = run({ risk: risk({ dailyNotionalUsd: 195 }) });
    expect(ruleOf(result, "daily-notional").status).toBe("block");
  });

  it("blocks leverage above the ceiling", () => {
    const result = run({ intent: intent({ leverage: 5 }) });
    expect(ruleOf(result, "leverage").status).toBe("block");
  });

  it("blocks once the daily loss limit is reached", () => {
    const result = run({ risk: risk({ realizedPnlToday: -10 }) });
    expect(ruleOf(result, "daily-loss").status).toBe("block");
  });

  it("blocks when equity has fallen past the drawdown breaker", () => {
    const result = run({
      risk: risk({ peakEquity: 1000, currentEquity: 940 }),
    });
    expect(ruleOf(result, "drawdown").status).toBe("block");
  });

  it("blocks inside the cooldown window and allows just outside it", () => {
    const blocked = run({
      risk: risk({ lastAcceptedTradeAt: NOW - 10_000 }),
    });
    expect(ruleOf(blocked, "cooldown").status).toBe("block");

    const allowed = run({
      risk: risk({ lastAcceptedTradeAt: NOW - 31_000 }),
    });
    expect(ruleOf(allowed, "cooldown").status).toBe("pass");
  });

  it("blocks once the hourly trade rate is used up, ignoring older trades", () => {
    const recent = Array.from({ length: 10 }, (_, i) => NOW - i * 60_000);
    expect(ruleOf(run({ acceptedTradeTimes: recent }), "rate-limit").status).toBe(
      "block",
    );

    const stale = Array.from({ length: 10 }, () => NOW - 2 * 60 * 60 * 1000);
    expect(ruleOf(run({ acceptedTradeTimes: stale }), "rate-limit").status).toBe(
      "pass",
    );
  });

  it("blocks a malformed order with no size", () => {
    const result = run({
      intent: intent({ quoteOrderQty: undefined, quantity: undefined }),
    });
    expect(ruleOf(result, "well-formed").status).toBe("block");
  });

  it("blocks a LIMIT order with no price", () => {
    const result = run({
      intent: intent({ orderType: "LIMIT", price: undefined }),
    });
    expect(ruleOf(result, "well-formed").status).toBe("block");
  });

  it("reports every breached rule, not just the first", () => {
    const result = run({
      intent: intent({
        symbol: "PEPEUSDT",
        venue: "usdm-futures",
        leverage: 25,
        quoteOrderQty: 5000,
      }),
    });
    const blocked = result.rules.filter((r) => r.status === "block").map((r) => r.id);
    expect(blocked).toEqual(
      expect.arrayContaining([
        "symbol-allowlist",
        "venue",
        "leverage",
        "max-notional",
      ]),
    );
  });
});

describe("entry-only rules", () => {
  it("blocks a new position beyond the position limit", () => {
    const positions = {
      ETHUSDT: { symbol: "ETHUSDT", qty: 1, avgPrice: 2500 },
      BNBUSDT: { symbol: "BNBUSDT", qty: 1, avgPrice: 600 },
      SOLUSDT: { symbol: "SOLUSDT", qty: 1, avgPrice: 100 },
    };
    const result = run({ risk: risk({ positions }) });
    expect(ruleOf(result, "open-positions").status).toBe("block");
  });

  it("still lets you sell out when at the position limit", () => {
    const positions = {
      ETHUSDT: { symbol: "ETHUSDT", qty: 1, avgPrice: 2500 },
      BNBUSDT: { symbol: "BNBUSDT", qty: 1, avgPrice: 600 },
      SOLUSDT: { symbol: "SOLUSDT", qty: 1, avgPrice: 100 },
    };
    const result = run({
      risk: risk({ positions }),
      intent: intent({ side: "SELL" }),
    });
    expect(ruleOf(result, "open-positions").status).toBe("pass");
  });

  it("blocks an entry that would over-concentrate the book", () => {
    const result = run({
      risk: risk({
        currentEquity: 100,
        positions: { BTCUSDT: { symbol: "BTCUSDT", qty: 0.001, avgPrice: MARK } },
      }),
      intent: intent({ quoteOrderQty: 20 }),
    });
    expect(ruleOf(result, "concentration").status).toBe("block");
  });

  it("blocks an entry when volatility is above the ceiling", () => {
    const result = run({ market: { markPrice: MARK, volatility1hPct: 9 } });
    expect(ruleOf(result, "volatility").status).toBe("block");
  });

  it("lets an exit through in high volatility", () => {
    const result = run({
      market: { markPrice: MARK, volatility1hPct: 9 },
      intent: intent({ side: "SELL" }),
    });
    expect(ruleOf(result, "volatility").status).toBe("pass");
  });

  it("treats a reduceOnly buy as an exit, not an entry", () => {
    const result = run({
      market: { markPrice: MARK, volatility1hPct: 9 },
      intent: intent({ reduceOnly: true }),
    });
    expect(ruleOf(result, "volatility").status).toBe("pass");
  });
});

describe("human approval", () => {
  it("requires approval at or above the threshold", () => {
    const result = run({ intent: intent({ quoteOrderQty: 15 }) });
    expect(result.decision).toBe("NEEDS_APPROVAL");
  });

  it("allows just below the threshold", () => {
    const result = run({ intent: intent({ quoteOrderQty: 14.99 }) });
    expect(result.decision).toBe("ALLOW");
  });

  it("lets a hard block outrank an approval request", () => {
    const result = run({
      intent: intent({ quoteOrderQty: 20 }),
      risk: risk({ halted: true }),
    });
    expect(result.decision).toBe("BLOCK");
  });
});
