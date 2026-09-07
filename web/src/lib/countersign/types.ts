// Core domain types for Countersign — the risk control plane for Binance Agent OS.

export type Venue = "spot" | "margin" | "usdm-futures" | "coinm-futures";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";

/** What the agent says it wants to do, before anything touches the exchange. */
export type TradeIntent = {
  venue: Venue;
  symbol: string;
  side: Side;
  orderType: OrderType;
  /** Base-asset amount, e.g. 0.001 BTC. */
  quantity?: number;
  /** Quote-asset amount, e.g. 25 USDT. One of quantity/quoteOrderQty is required. */
  quoteOrderQty?: number;
  /** Required for LIMIT orders; also used to price a notional when set. */
  price?: number;
  leverage?: number;
  reduceOnly?: boolean;
  /** The agent's stated reason. Recorded verbatim in the ledger. */
  rationale: string;
};

export type Policy = {
  /** Only these symbols may be traded. Empty array means "nothing allowed". */
  symbolAllowlist: string[];
  allowedVenues: Venue[];
  /** Per-trade notional ceiling in USD. */
  maxNotionalUsd: number;
  /** Cumulative notional the agent may push through in one UTC day. */
  maxDailyNotionalUsd: number;
  maxLeverage: number;
  /** Trades at or above this notional need a human click, even if every rule passes. */
  approvalThresholdUsd: number;
  /** Realised loss for the UTC day that trips a full halt. */
  dailyLossLimitUsd: number;
  /** Equity drawdown from session peak, in percent, that trips a full halt. */
  maxDrawdownPct: number;
  /** Minimum gap between two accepted trades — the runaway-loop guard. */
  cooldownSeconds: number;
  maxTradesPerHour: number;
  maxOpenPositions: number;
  /** No single symbol may exceed this share of equity. */
  maxSymbolConcentrationPct: number;
  /** Block entries when 1h realised volatility exceeds this, in percent. */
  maxVolatility1hPct: number;
};

export type RuleStatus = "pass" | "warn" | "block" | "approval";

export type RuleResult = {
  id: string;
  label: string;
  status: RuleStatus;
  detail: string;
  observed?: number;
  limit?: number;
  /** 0..1 — how much of this budget the trade consumes. Drives the dashboard gauges. */
  utilisation?: number;
};

export type Decision = "ALLOW" | "BLOCK" | "NEEDS_APPROVAL";

export type Verdict = {
  id: string;
  createdAt: number;
  intent: TradeIntent;
  decision: Decision;
  /** Resolved USD notional the rules were actually evaluated against. */
  notionalUsd: number;
  markPrice: number;
  rules: RuleResult[];
  /** Human-readable summary of why it went this way. */
  summary: string;
  /** Present on ALLOW, and on NEEDS_APPROVAL once a human approves. */
  token?: string;
  tokenExpiresAt?: number;
  /** Set once a fill is attested against this verdict's token. */
  consumedAt?: number;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
};

export type Fill = {
  id: string;
  recordedAt: number;
  verdictId: string | null;
  orderId: string;
  symbol: string;
  side: Side;
  executedQty: number;
  avgPrice: number;
  notionalUsd: number;
  status: string;
  /** false when a fill turned up with no matching verdict token — the thing we exist to catch. */
  attested: boolean;
};

export type Position = {
  symbol: string;
  qty: number;
  avgPrice: number;
};

export type RiskState = {
  halted: boolean;
  haltReason?: string;
  haltedAt?: number;
  /** UTC date key, e.g. "2026-09-07". Rolls the daily counters over. */
  dayKey: string;
  sessionStartEquity: number;
  peakEquity: number;
  currentEquity: number;
  realizedPnlToday: number;
  dailyNotionalUsd: number;
  lastAcceptedTradeAt?: number;
  positions: Record<string, Position>;
};

export type CountersignState = {
  policy: Policy;
  risk: RiskState;
  verdicts: Verdict[];
  fills: Fill[];
};

export const DEFAULT_POLICY: Policy = {
  symbolAllowlist: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
  allowedVenues: ["spot"],
  maxNotionalUsd: 25,
  maxDailyNotionalUsd: 200,
  maxLeverage: 1,
  approvalThresholdUsd: 15,
  dailyLossLimitUsd: 10,
  maxDrawdownPct: 5,
  cooldownSeconds: 30,
  maxTradesPerHour: 10,
  maxOpenPositions: 3,
  maxSymbolConcentrationPct: 60,
  maxVolatility1hPct: 3,
};
