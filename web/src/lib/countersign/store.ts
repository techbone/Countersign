// Single source of truth for policy, risk state and the attestation ledger.
// Held in memory, mirrored to .countersign/state.json so a dev-server restart or
// an MCP reconnect does not lose the audit trail.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

import { evaluate } from "./policy";
import { getMarketContext } from "./market";
import {
  DEFAULT_POLICY,
  type Fill,
  type Policy,
  type RiskState,
  type CountersignState,
  type TradeIntent,
  type Verdict,
} from "./types";

// Statically scoped to a subfolder of the project: a path that escapes cwd makes
// Turbopack trace (and bundle) the entire repository into the server output.
const STATE_PATH =
  process.env.COUNTERSIGN_STATE_PATH ??
  join(process.cwd(), ".countersign", "state.json");

const TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_LEDGER = 500;

function utcDayKey(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

function freshRisk(equity = 1000): RiskState {
  return {
    halted: false,
    dayKey: utcDayKey(),
    sessionStartEquity: equity,
    peakEquity: equity,
    currentEquity: equity,
    realizedPnlToday: 0,
    dailyNotionalUsd: 0,
    positions: {},
  };
}

type Listener = (event: CountersignEvent) => void;

export type CountersignEvent =
  | { type: "verdict"; verdict: Verdict }
  | { type: "fill"; fill: Fill }
  | { type: "policy"; policy: Policy }
  | { type: "risk"; risk: RiskState }
  | { type: "halt"; halted: boolean; reason?: string };

type Runtime = {
  state: CountersignState;
  secret: string;
  acceptedTradeTimes: number[];
  listeners: Set<Listener>;
};

// Next dev-mode HMR re-evaluates modules; hang the singleton off globalThis so
// the ledger survives a hot reload.
const globalKey = Symbol.for("countersign.runtime");
type GlobalWithRuntime = typeof globalThis & { [globalKey]?: Runtime };

function load(): Runtime {
  const g = globalThis as GlobalWithRuntime;
  if (g[globalKey]) return g[globalKey];

  let state: CountersignState = {
    policy: { ...DEFAULT_POLICY },
    risk: freshRisk(),
    verdicts: [],
    fills: [],
  };
  let secret = "";

  try {
    const raw = readFileSync(/* turbopackIgnore: true */ STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CountersignState & { secret?: string };
    state = {
      policy: { ...DEFAULT_POLICY, ...parsed.policy },
      risk: { ...freshRisk(), ...parsed.risk },
      verdicts: parsed.verdicts ?? [],
      fills: parsed.fills ?? [],
    };
    secret = parsed.secret ?? "";
  } catch {
    // No state file yet — first run.
  }

  if (!secret) secret = randomBytes(32).toString("hex");

  const runtime: Runtime = {
    state,
    secret,
    acceptedTradeTimes: state.fills.map((f) => f.recordedAt),
    listeners: new Set(),
  };
  g[globalKey] = runtime;
  return runtime;
}

function persist(rt: Runtime): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    const tmp = `${STATE_PATH}.${process.pid}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({ ...rt.state, secret: rt.secret }, null, 2),
    );
    renameSync(tmp, STATE_PATH);
  } catch {
    // Persistence is best-effort; never break a trade decision over it.
  }
}

function emit(rt: Runtime, event: CountersignEvent): void {
  for (const l of rt.listeners) {
    try {
      l(event);
    } catch {
      // A broken SSE client must not take down the store.
    }
  }
}

/** Roll the daily counters when the UTC day changes. */
function rollDay(rt: Runtime): void {
  const today = utcDayKey();
  if (rt.state.risk.dayKey !== today) {
    rt.state.risk.dayKey = today;
    rt.state.risk.realizedPnlToday = 0;
    rt.state.risk.dailyNotionalUsd = 0;
  }
}

function signToken(rt: Runtime, verdictId: string, nonce: string): string {
  const mac = createHmac("sha256", rt.secret)
    .update(`${verdictId}.${nonce}`)
    .digest("hex")
    .slice(0, 24);
  return `csn_${verdictId}_${nonce}_${mac}`;
}

function verifyToken(rt: Runtime, token: string): string | null {
  const parts = token.split("_");
  if (parts.length !== 4 || parts[0] !== "csn") return null;
  const [, verdictId, nonce, mac] = parts;
  const expected = createHmac("sha256", rt.secret)
    .update(`${verdictId}.${nonce}`)
    .digest("hex")
    .slice(0, 24);
  return mac === expected ? verdictId : null;
}

export function subscribe(listener: Listener): () => void {
  const rt = load();
  rt.listeners.add(listener);
  return () => rt.listeners.delete(listener);
}

export function getState(): CountersignState {
  const rt = load();
  rollDay(rt);
  return rt.state;
}

export function setPolicy(patch: Partial<Policy>): Policy {
  const rt = load();
  rt.state.policy = { ...rt.state.policy, ...patch };
  persist(rt);
  emit(rt, { type: "policy", policy: rt.state.policy });
  return rt.state.policy;
}

export function setHalted(halted: boolean, reason?: string): RiskState {
  const rt = load();
  rt.state.risk.halted = halted;
  rt.state.risk.haltReason = halted ? (reason ?? "Operator halt") : undefined;
  rt.state.risk.haltedAt = halted ? Date.now() : undefined;
  persist(rt);
  emit(rt, { type: "halt", halted, reason: rt.state.risk.haltReason });
  emit(rt, { type: "risk", risk: rt.state.risk });
  return rt.state.risk;
}

/** Let the operator seed equity from the real sub-account balance. */
export function setEquity(equity: number, resetSession = false): RiskState {
  const rt = load();
  rt.state.risk.currentEquity = equity;
  if (resetSession) {
    rt.state.risk.sessionStartEquity = equity;
    rt.state.risk.peakEquity = equity;
  }
  rt.state.risk.peakEquity = Math.max(rt.state.risk.peakEquity, equity);
  persist(rt);
  emit(rt, { type: "risk", risk: rt.state.risk });
  return rt.state.risk;
}

export async function evaluateIntent(intent: TradeIntent): Promise<Verdict> {
  const rt = load();
  rollDay(rt);

  const symbol = intent.symbol.toUpperCase();
  const market = await getMarketContext(symbol);

  const result = evaluate({
    intent: { ...intent, symbol },
    policy: rt.state.policy,
    risk: rt.state.risk,
    market: { markPrice: market.markPrice, volatility1hPct: market.volatility1hPct },
    acceptedTradeTimes: rt.acceptedTradeTimes,
  });

  const verdict: Verdict = {
    id: randomUUID().slice(0, 8),
    createdAt: Date.now(),
    intent: { ...intent, symbol },
    decision: result.decision,
    notionalUsd: result.notionalUsd,
    markPrice: market.markPrice,
    rules: result.rules,
    summary: market.degraded
      ? `${result.summary} (market data unavailable — priced from the intent)`
      : result.summary,
  };

  if (verdict.decision === "ALLOW") {
    const nonce = randomBytes(6).toString("hex");
    verdict.token = signToken(rt, verdict.id, nonce);
    verdict.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  }

  rt.state.verdicts.unshift(verdict);
  if (rt.state.verdicts.length > MAX_LEDGER) rt.state.verdicts.length = MAX_LEDGER;
  persist(rt);
  emit(rt, { type: "verdict", verdict });
  return verdict;
}

export function resolveApproval(
  verdictId: string,
  approve: boolean,
  by = "operator",
): Verdict | null {
  const rt = load();
  const verdict = rt.state.verdicts.find((v) => v.id === verdictId);
  if (!verdict || verdict.decision !== "NEEDS_APPROVAL") return null;
  if (verdict.approvedAt || verdict.rejectedAt) return verdict;

  if (approve) {
    const nonce = randomBytes(6).toString("hex");
    verdict.token = signToken(rt, verdict.id, nonce);
    verdict.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    verdict.approvedAt = Date.now();
    verdict.approvedBy = by;
  } else {
    verdict.rejectedAt = Date.now();
  }

  persist(rt);
  emit(rt, { type: "verdict", verdict });
  return verdict;
}

export type ConfirmArgs = {
  token: string;
  orderId: string;
  executedQty: number;
  avgPrice: number;
  status?: string;
};

export type ConfirmResult =
  | { ok: true; fill: Fill }
  | { ok: false; error: string };

export function confirmFill(args: ConfirmArgs): ConfirmResult {
  const rt = load();
  rollDay(rt);

  const verdictId = verifyToken(rt, args.token);
  if (!verdictId) return { ok: false, error: "Token signature is invalid." };

  const verdict = rt.state.verdicts.find((v) => v.id === verdictId);
  if (!verdict) return { ok: false, error: "No verdict matches this token." };
  if (verdict.consumedAt)
    return { ok: false, error: "Token has already been used." };
  if (verdict.tokenExpiresAt && Date.now() > verdict.tokenExpiresAt)
    return { ok: false, error: "Token has expired; re-evaluate the trade." };
  if (!verdict.token || verdict.token !== args.token)
    return { ok: false, error: "Token does not match the verdict on file." };

  const notionalUsd = args.executedQty * args.avgPrice;
  const fill: Fill = {
    id: randomUUID().slice(0, 8),
    recordedAt: Date.now(),
    verdictId: verdict.id,
    orderId: args.orderId,
    symbol: verdict.intent.symbol,
    side: verdict.intent.side,
    executedQty: args.executedQty,
    avgPrice: args.avgPrice,
    notionalUsd,
    status: args.status ?? "FILLED",
    attested: true,
  };

  verdict.consumedAt = fill.recordedAt;
  applyFillToRisk(rt, fill);

  rt.state.fills.unshift(fill);
  if (rt.state.fills.length > MAX_LEDGER) rt.state.fills.length = MAX_LEDGER;
  rt.acceptedTradeTimes.push(fill.recordedAt);

  persist(rt);
  emit(rt, { type: "fill", fill });
  emit(rt, { type: "verdict", verdict });
  emit(rt, { type: "risk", risk: rt.state.risk });
  return { ok: true, fill };
}

/** Update positions, realised P&L and budgets from a fill. */
function applyFillToRisk(rt: Runtime, fill: Fill): void {
  const risk = rt.state.risk;
  risk.dailyNotionalUsd += fill.notionalUsd;
  risk.lastAcceptedTradeAt = fill.recordedAt;

  const pos = risk.positions[fill.symbol] ?? {
    symbol: fill.symbol,
    qty: 0,
    avgPrice: 0,
  };

  if (fill.side === "BUY") {
    const totalCost = pos.qty * pos.avgPrice + fill.executedQty * fill.avgPrice;
    pos.qty += fill.executedQty;
    pos.avgPrice = pos.qty > 0 ? totalCost / pos.qty : 0;
  } else {
    const closed = Math.min(pos.qty, fill.executedQty);
    if (closed > 0) {
      risk.realizedPnlToday += closed * (fill.avgPrice - pos.avgPrice);
      risk.currentEquity += closed * (fill.avgPrice - pos.avgPrice);
    }
    pos.qty = Math.max(0, pos.qty - fill.executedQty);
    if (pos.qty === 0) pos.avgPrice = 0;
  }

  risk.positions[fill.symbol] = pos;
  risk.peakEquity = Math.max(risk.peakEquity, risk.currentEquity);

  // Auto-halt the moment a hard limit is breached, without waiting for the
  // agent to ask permission for its next trade.
  const lossToday = Math.max(0, -risk.realizedPnlToday);
  const drawdownPct =
    risk.peakEquity > 0
      ? ((risk.peakEquity - risk.currentEquity) / risk.peakEquity) * 100
      : 0;

  if (!risk.halted && lossToday >= rt.state.policy.dailyLossLimitUsd) {
    risk.halted = true;
    risk.haltReason = `Daily loss limit hit ($${lossToday.toFixed(2)}).`;
    risk.haltedAt = Date.now();
    emit(rt, { type: "halt", halted: true, reason: risk.haltReason });
  } else if (!risk.halted && drawdownPct >= rt.state.policy.maxDrawdownPct) {
    risk.halted = true;
    risk.haltReason = `Drawdown breaker tripped (${drawdownPct.toFixed(2)}%).`;
    risk.haltedAt = Date.now();
    emit(rt, { type: "halt", halted: true, reason: risk.haltReason });
  }
}

export type ExchangeTrade = {
  orderId: string;
  symbol: string;
  side: string;
  executedQty: number;
  price: number;
  time?: number;
};

export type ReconcileReport = {
  checked: number;
  attested: number;
  unattested: ExchangeTrade[];
  coveragePct: number;
};

/**
 * Compare what the exchange says happened against what Countersign authorised.
 * Any exchange trade with no matching attested fill is an unattested order —
 * the agent traded without clearing policy first.
 */
export function reconcile(trades: ExchangeTrade[]): ReconcileReport {
  const rt = load();
  const known = new Set(rt.state.fills.map((f) => String(f.orderId)));
  const unattested = trades.filter((t) => !known.has(String(t.orderId)));

  for (const t of unattested) {
    const fill: Fill = {
      id: randomUUID().slice(0, 8),
      recordedAt: t.time ?? Date.now(),
      verdictId: null,
      orderId: String(t.orderId),
      symbol: t.symbol,
      side: t.side.toUpperCase() === "SELL" ? "SELL" : "BUY",
      executedQty: t.executedQty,
      avgPrice: t.price,
      notionalUsd: t.executedQty * t.price,
      status: "UNATTESTED",
      attested: false,
    };
    rt.state.fills.unshift(fill);
    emit(rt, { type: "fill", fill });
  }

  if (unattested.length > 0) persist(rt);

  const checked = trades.length;
  const attested = checked - unattested.length;
  return {
    checked,
    attested,
    unattested,
    coveragePct: checked === 0 ? 100 : (attested / checked) * 100,
  };
}

export type SessionReport = {
  policy: Policy;
  risk: RiskState;
  verdictCounts: Record<string, number>;
  totalVerdicts: number;
  fills: number;
  unattestedFills: number;
  attestationCoveragePct: number;
  drawdownPct: number;
  tradesLastHour: number;
  topBlockReasons: { rule: string; count: number }[];
};

export function buildReport(): SessionReport {
  const { policy, risk, verdicts, fills } = getState();

  const verdictCounts: Record<string, number> = {
    ALLOW: 0,
    BLOCK: 0,
    NEEDS_APPROVAL: 0,
  };
  const blockTally = new Map<string, number>();

  for (const v of verdicts) {
    verdictCounts[v.decision] = (verdictCounts[v.decision] ?? 0) + 1;
    if (v.decision === "BLOCK") {
      for (const r of v.rules) {
        if (r.status === "block") {
          blockTally.set(r.label, (blockTally.get(r.label) ?? 0) + 1);
        }
      }
    }
  }

  const unattestedFills = fills.filter((f) => !f.attested).length;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const tradesLastHour = fills.filter((f) => f.recordedAt >= hourAgo).length;
  const drawdownPct =
    risk.peakEquity > 0
      ? ((risk.peakEquity - risk.currentEquity) / risk.peakEquity) * 100
      : 0;

  return {
    policy,
    risk,
    verdictCounts,
    totalVerdicts: verdicts.length,
    fills: fills.length,
    unattestedFills,
    attestationCoveragePct:
      fills.length === 0
        ? 100
        : ((fills.length - unattestedFills) / fills.length) * 100,
    drawdownPct,
    tradesLastHour,
    topBlockReasons: [...blockTally.entries()]
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

export function resetSession(equity = 1000): CountersignState {
  const rt = load();
  rt.state.risk = freshRisk(equity);
  rt.state.verdicts = [];
  rt.state.fills = [];
  rt.acceptedTradeTimes = [];
  persist(rt);
  emit(rt, { type: "risk", risk: rt.state.risk });
  return rt.state;
}
