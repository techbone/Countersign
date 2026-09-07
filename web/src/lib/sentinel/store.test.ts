import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The store resolves live prices; pin them so these tests never touch a network.
vi.mock("./market", () => ({
  getMarketContext: async () => ({
    markPrice: 80_000,
    volatility1hPct: 0.5,
    degraded: false,
  }),
  getMarkPrice: async () => 80_000,
  getVolatility1hPct: async () => 0.5,
  getTickers: async () => [],
}));

process.env.SENTINEL_STATE_PATH = join(
  mkdtempSync(join(tmpdir(), "sentinel-test-")),
  "state.json",
);

const {
  confirmFill,
  evaluateIntent,
  getState,
  reconcile,
  resetSession,
  resolveApproval,
  setHalted,
  setPolicy,
} = await import("./store");

/** A trade that clears policy with room to spare. */
const smallBuy = {
  venue: "spot" as const,
  symbol: "BTCUSDT",
  side: "BUY" as const,
  orderType: "MARKET" as const,
  quoteOrderQty: 8,
  rationale: "test",
};

beforeEach(() => {
  resetSession(1000);
  setPolicy({ cooldownSeconds: 0 });
});

describe("execution tokens", () => {
  it("mints a token on ALLOW and records the verdict", () => {
    return evaluateIntent(smallBuy).then((verdict) => {
      expect(verdict.decision).toBe("ALLOW");
      expect(verdict.token).toMatch(/^stn_/);
      expect(verdict.tokenExpiresAt).toBeGreaterThan(Date.now());
      expect(getState().verdicts[0].id).toBe(verdict.id);
    });
  });

  it("mints no token when the trade is blocked", async () => {
    const verdict = await evaluateIntent({ ...smallBuy, quoteOrderQty: 5000 });
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.token).toBeUndefined();
  });

  it("accepts a valid token exactly once", async () => {
    const verdict = await evaluateIntent(smallBuy);
    const args = {
      token: verdict.token!,
      orderId: "1",
      executedQty: 0.0001,
      avgPrice: 80_000,
    };

    const first = confirmFill(args);
    expect(first.ok).toBe(true);

    const replay = confirmFill({ ...args, orderId: "2" });
    expect(replay).toEqual({ ok: false, error: "Token has already been used." });
  });

  it("rejects a forged signature", () => {
    const result = confirmFill({
      token: "stn_deadbeef_aaaaaaaaaaaa_ffffffffffffffffffffffff",
      orderId: "9",
      executedQty: 1,
      avgPrice: 100,
    });
    expect(result).toEqual({ ok: false, error: "Token signature is invalid." });
  });

  it("rejects a token whose verdict id has been tampered with", async () => {
    const verdict = await evaluateIntent(smallBuy);
    const [, , nonce, mac] = verdict.token!.split("_");
    const result = confirmFill({
      token: `stn_00000000_${nonce}_${mac}`,
      orderId: "9",
      executedQty: 1,
      avgPrice: 100,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const verdict = await evaluateIntent(smallBuy);
    getState().verdicts[0].tokenExpiresAt = Date.now() - 1;

    const result = confirmFill({
      token: verdict.token!,
      orderId: "9",
      executedQty: 0.0001,
      avgPrice: 80_000,
    });
    expect(result).toEqual({
      ok: false,
      error: "Token has expired; re-evaluate the trade.",
    });
  });
});

describe("human approval", () => {
  it("issues no token until a human approves, then exactly one", async () => {
    const verdict = await evaluateIntent({ ...smallBuy, quoteOrderQty: 20 });
    expect(verdict.decision).toBe("NEEDS_APPROVAL");
    expect(verdict.token).toBeUndefined();

    const approved = resolveApproval(verdict.id, true, "operator");
    expect(approved?.token).toMatch(/^stn_/);
    expect(approved?.approvedBy).toBe("operator");
  });

  it("issues no token when a human rejects", async () => {
    const verdict = await evaluateIntent({ ...smallBuy, quoteOrderQty: 20 });
    const rejected = resolveApproval(verdict.id, false);
    expect(rejected?.token).toBeUndefined();
    expect(rejected?.rejectedAt).toBeDefined();
  });
});

describe("reconciliation", () => {
  it("flags an exchange order that Sentinel never authorised", async () => {
    const verdict = await evaluateIntent(smallBuy);
    confirmFill({
      token: verdict.token!,
      orderId: "AUTHORISED-1",
      executedQty: 0.0001,
      avgPrice: 80_000,
    });

    const report = reconcile([
      {
        orderId: "AUTHORISED-1",
        symbol: "BTCUSDT",
        side: "BUY",
        executedQty: 0.0001,
        price: 80_000,
      },
      {
        orderId: "ROGUE-1",
        symbol: "BTCUSDT",
        side: "BUY",
        executedQty: 0.5,
        price: 80_000,
      },
    ]);

    expect(report.checked).toBe(2);
    expect(report.attested).toBe(1);
    expect(report.coveragePct).toBe(50);
    expect(report.unattested[0].orderId).toBe("ROGUE-1");

    const rogue = getState().fills.find((f) => f.orderId === "ROGUE-1");
    expect(rogue?.attested).toBe(false);
    expect(rogue?.status).toBe("UNATTESTED");
  });

  it("reports full coverage when nothing bypassed the control plane", () => {
    expect(reconcile([]).coveragePct).toBe(100);
  });
});

describe("breakers", () => {
  it("halts automatically once a fill breaches the daily loss limit", async () => {
    setPolicy({
      maxNotionalUsd: 5000,
      maxDailyNotionalUsd: 100_000,
      approvalThresholdUsd: 5000,
      maxSymbolConcentrationPct: 10_000,
      dailyLossLimitUsd: 5,
      cooldownSeconds: 0,
    });

    const buy = await evaluateIntent({
      ...smallBuy,
      quoteOrderQty: undefined,
      quantity: 0.01,
    });
    confirmFill({
      token: buy.token!,
      orderId: "B1",
      executedQty: 0.01,
      avgPrice: 80_000,
    });
    expect(getState().risk.halted).toBe(false);

    const sell = await evaluateIntent({
      ...smallBuy,
      side: "SELL",
      quoteOrderQty: undefined,
      quantity: 0.01,
    });
    confirmFill({
      token: sell.token!,
      orderId: "S1",
      executedQty: 0.01,
      avgPrice: 79_000,
    });

    const { risk } = getState();
    expect(risk.realizedPnlToday).toBeCloseTo(-10);
    expect(risk.halted).toBe(true);
    expect(risk.haltReason).toContain("Daily loss limit");
  });

  it("blocks every trade once halted", async () => {
    setHalted(true, "operator stop");
    const verdict = await evaluateIntent(smallBuy);
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.token).toBeUndefined();
  });
});

describe("policy", () => {
  it("persists a patch without clobbering the other limits", () => {
    const before = getState().policy;
    const after = setPolicy({ maxNotionalUsd: 42 });
    expect(after.maxNotionalUsd).toBe(42);
    expect(after.maxLeverage).toBe(before.maxLeverage);
  });
});
