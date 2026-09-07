// The policy engine. Deterministic, pure, and independent of the LLM:
// given an intent and the current risk state, the verdict is always the same.
// Nothing here calls the network — the caller resolves the mark price first.

import type {
  Decision,
  Policy,
  RiskState,
  RuleResult,
  TradeIntent,
} from "./types";

export type MarketContext = {
  markPrice: number;
  /** Realised volatility over the last hour, in percent. */
  volatility1hPct: number;
};

export type Evaluation = {
  decision: Decision;
  notionalUsd: number;
  rules: RuleResult[];
  summary: string;
};

/** Resolve the USD notional a trade actually represents. */
export function resolveNotionalUsd(
  intent: TradeIntent,
  markPrice: number,
): number {
  if (typeof intent.quoteOrderQty === "number") return intent.quoteOrderQty;
  const qty = intent.quantity ?? 0;
  const price = intent.price ?? markPrice;
  return qty * price;
}

function ratio(observed: number, limit: number): number {
  if (limit <= 0) return observed > 0 ? 1 : 0;
  return Math.min(observed / limit, 1);
}

function countTradesInLastHour(
  acceptedAt: number[],
  now: number,
): number {
  const cutoff = now - 60 * 60 * 1000;
  return acceptedAt.filter((t) => t >= cutoff).length;
}

export type EvaluateArgs = {
  intent: TradeIntent;
  policy: Policy;
  risk: RiskState;
  market: MarketContext;
  /** Timestamps of previously accepted trades, for the rate limiter. */
  acceptedTradeTimes: number[];
  now?: number;
};

/**
 * Run every rule. Rules never short-circuit: we always return the full card so
 * the dashboard can show what passed as well as what failed.
 */
export function evaluate({
  intent,
  policy,
  risk,
  market,
  acceptedTradeTimes,
  now = Date.now(),
}: EvaluateArgs): Evaluation {
  const rules: RuleResult[] = [];
  const notionalUsd = resolveNotionalUsd(intent, market.markPrice);
  const symbol = intent.symbol.toUpperCase();

  // 1. Kill switch — overrides everything else.
  rules.push(
    risk.halted
      ? {
          id: "kill-switch",
          label: "Kill switch",
          status: "block",
          detail: risk.haltReason
            ? `Trading is halted: ${risk.haltReason}`
            : "Trading is halted by the operator.",
        }
      : {
          id: "kill-switch",
          label: "Kill switch",
          status: "pass",
          detail: "Trading is live.",
        },
  );

  // 2. Symbol allowlist.
  const symbolAllowed = policy.symbolAllowlist
    .map((s) => s.toUpperCase())
    .includes(symbol);
  rules.push({
    id: "symbol-allowlist",
    label: "Symbol allowlist",
    status: symbolAllowed ? "pass" : "block",
    detail: symbolAllowed
      ? `${symbol} is on the allowlist.`
      : `${symbol} is not on the allowlist (${policy.symbolAllowlist.join(", ") || "empty"}).`,
  });

  // 3. Venue allowlist.
  const venueAllowed = policy.allowedVenues.includes(intent.venue);
  rules.push({
    id: "venue",
    label: "Venue",
    status: venueAllowed ? "pass" : "block",
    detail: venueAllowed
      ? `${intent.venue} is permitted.`
      : `${intent.venue} is not permitted (allowed: ${policy.allowedVenues.join(", ") || "none"}).`,
  });

  // 4. Per-trade notional ceiling.
  const overNotional = notionalUsd > policy.maxNotionalUsd;
  rules.push({
    id: "max-notional",
    label: "Per-trade notional",
    status: overNotional ? "block" : "pass",
    detail: overNotional
      ? `$${notionalUsd.toFixed(2)} exceeds the $${policy.maxNotionalUsd} per-trade cap.`
      : `$${notionalUsd.toFixed(2)} is within the $${policy.maxNotionalUsd} cap.`,
    observed: notionalUsd,
    limit: policy.maxNotionalUsd,
    utilisation: ratio(notionalUsd, policy.maxNotionalUsd),
  });

  // 5. Daily notional budget.
  const projectedDaily = risk.dailyNotionalUsd + notionalUsd;
  const overDaily = projectedDaily > policy.maxDailyNotionalUsd;
  rules.push({
    id: "daily-notional",
    label: "Daily notional budget",
    status: overDaily ? "block" : "pass",
    detail: overDaily
      ? `$${projectedDaily.toFixed(2)} would exceed today's $${policy.maxDailyNotionalUsd} budget.`
      : `$${projectedDaily.toFixed(2)} of $${policy.maxDailyNotionalUsd} used after this trade.`,
    observed: projectedDaily,
    limit: policy.maxDailyNotionalUsd,
    utilisation: ratio(projectedDaily, policy.maxDailyNotionalUsd),
  });

  // 6. Leverage ceiling.
  const leverage = intent.leverage ?? 1;
  const overLeverage = leverage > policy.maxLeverage;
  rules.push({
    id: "leverage",
    label: "Leverage",
    status: overLeverage ? "block" : "pass",
    detail: overLeverage
      ? `${leverage}x exceeds the ${policy.maxLeverage}x ceiling.`
      : `${leverage}x is within the ${policy.maxLeverage}x ceiling.`,
    observed: leverage,
    limit: policy.maxLeverage,
    utilisation: ratio(leverage, policy.maxLeverage),
  });

  // 7. Daily realised loss limit.
  const lossToday = Math.max(0, -risk.realizedPnlToday);
  const lossTripped = lossToday >= policy.dailyLossLimitUsd;
  rules.push({
    id: "daily-loss",
    label: "Daily loss limit",
    status: lossTripped ? "block" : "pass",
    detail: lossTripped
      ? `Realised loss of $${lossToday.toFixed(2)} has hit the $${policy.dailyLossLimitUsd} daily stop.`
      : `Realised loss today is $${lossToday.toFixed(2)} of $${policy.dailyLossLimitUsd}.`,
    observed: lossToday,
    limit: policy.dailyLossLimitUsd,
    utilisation: ratio(lossToday, policy.dailyLossLimitUsd),
  });

  // 8. Drawdown circuit breaker, measured from session peak equity.
  const drawdownPct =
    risk.peakEquity > 0
      ? ((risk.peakEquity - risk.currentEquity) / risk.peakEquity) * 100
      : 0;
  const drawdownTripped = drawdownPct >= policy.maxDrawdownPct;
  rules.push({
    id: "drawdown",
    label: "Drawdown breaker",
    status: drawdownTripped ? "block" : "pass",
    detail: drawdownTripped
      ? `Equity is ${drawdownPct.toFixed(2)}% below session peak, past the ${policy.maxDrawdownPct}% breaker.`
      : `Drawdown is ${drawdownPct.toFixed(2)}% of the ${policy.maxDrawdownPct}% breaker.`,
    observed: drawdownPct,
    limit: policy.maxDrawdownPct,
    utilisation: ratio(drawdownPct, policy.maxDrawdownPct),
  });

  // 9. Cooldown between accepted trades.
  const sinceLast =
    risk.lastAcceptedTradeAt != null
      ? (now - risk.lastAcceptedTradeAt) / 1000
      : Number.POSITIVE_INFINITY;
  const inCooldown = sinceLast < policy.cooldownSeconds;
  rules.push({
    id: "cooldown",
    label: "Cooldown",
    status: inCooldown ? "block" : "pass",
    detail: inCooldown
      ? `Only ${sinceLast.toFixed(0)}s since the last trade; ${policy.cooldownSeconds}s required.`
      : `Last trade was ${Number.isFinite(sinceLast) ? `${sinceLast.toFixed(0)}s` : "never"} ago.`,
    observed: Number.isFinite(sinceLast) ? sinceLast : policy.cooldownSeconds,
    limit: policy.cooldownSeconds,
  });

  // 10. Trades-per-hour rate limit — catches a looping agent.
  const tradesLastHour = countTradesInLastHour(acceptedTradeTimes, now);
  const overRate = tradesLastHour >= policy.maxTradesPerHour;
  rules.push({
    id: "rate-limit",
    label: "Trade rate",
    status: overRate ? "block" : "pass",
    detail: overRate
      ? `${tradesLastHour} trades in the last hour hits the ${policy.maxTradesPerHour}/h limit.`
      : `${tradesLastHour} of ${policy.maxTradesPerHour} trades used this hour.`,
    observed: tradesLastHour,
    limit: policy.maxTradesPerHour,
    utilisation: ratio(tradesLastHour, policy.maxTradesPerHour),
  });

  // 11. Open position count. Only entries are constrained; exits always allowed through.
  const openSymbols = Object.values(risk.positions).filter(
    (p) => Math.abs(p.qty) > 0,
  );
  const isNewPosition = !risk.positions[symbol] || risk.positions[symbol].qty === 0;
  const isEntry = !intent.reduceOnly && intent.side === "BUY";
  const overPositions =
    isEntry && isNewPosition && openSymbols.length >= policy.maxOpenPositions;
  rules.push({
    id: "open-positions",
    label: "Open positions",
    status: overPositions ? "block" : "pass",
    detail: overPositions
      ? `Already holding ${openSymbols.length} positions, the limit is ${policy.maxOpenPositions}.`
      : `Holding ${openSymbols.length} of ${policy.maxOpenPositions} allowed positions.`,
    observed: openSymbols.length,
    limit: policy.maxOpenPositions,
    utilisation: ratio(openSymbols.length, policy.maxOpenPositions),
  });

  // 12. Per-symbol concentration against equity.
  const existing = risk.positions[symbol];
  const existingNotional = existing
    ? Math.abs(existing.qty) * market.markPrice
    : 0;
  const projectedNotional =
    intent.side === "BUY"
      ? existingNotional + notionalUsd
      : Math.max(0, existingNotional - notionalUsd);
  const concentrationPct =
    risk.currentEquity > 0 ? (projectedNotional / risk.currentEquity) * 100 : 0;
  const overConcentration =
    isEntry && concentrationPct > policy.maxSymbolConcentrationPct;
  rules.push({
    id: "concentration",
    label: "Concentration",
    status: overConcentration ? "block" : "pass",
    detail: overConcentration
      ? `${symbol} would be ${concentrationPct.toFixed(1)}% of equity, past the ${policy.maxSymbolConcentrationPct}% cap.`
      : `${symbol} would be ${concentrationPct.toFixed(1)}% of equity.`,
    observed: concentrationPct,
    limit: policy.maxSymbolConcentrationPct,
    utilisation: ratio(concentrationPct, policy.maxSymbolConcentrationPct),
  });

  // 13. Volatility guard — refuse new entries into a market that is running.
  const volTripped =
    isEntry && market.volatility1hPct > policy.maxVolatility1hPct;
  rules.push({
    id: "volatility",
    label: "Volatility guard",
    status: volTripped ? "block" : "pass",
    detail: volTripped
      ? `1h realised volatility is ${market.volatility1hPct.toFixed(2)}%, above the ${policy.maxVolatility1hPct}% ceiling.`
      : `1h realised volatility is ${market.volatility1hPct.toFixed(2)}%.`,
    observed: market.volatility1hPct,
    limit: policy.maxVolatility1hPct,
    utilisation: ratio(market.volatility1hPct, policy.maxVolatility1hPct),
  });

  // 14. Human-in-the-loop threshold. Checked last: it only matters if nothing blocked.
  const needsApproval = notionalUsd >= policy.approvalThresholdUsd;
  rules.push({
    id: "approval-threshold",
    label: "Human approval",
    status: needsApproval ? "approval" : "pass",
    detail: needsApproval
      ? `$${notionalUsd.toFixed(2)} is at or above the $${policy.approvalThresholdUsd} approval threshold.`
      : `$${notionalUsd.toFixed(2)} is below the $${policy.approvalThresholdUsd} approval threshold.`,
    observed: notionalUsd,
    limit: policy.approvalThresholdUsd,
  });

  // 15. Sanity: the intent has to actually describe a trade.
  const sized =
    (intent.quantity ?? 0) > 0 || (intent.quoteOrderQty ?? 0) > 0;
  const limitPriced = intent.orderType !== "LIMIT" || (intent.price ?? 0) > 0;
  const wellFormed = sized && limitPriced && notionalUsd > 0;
  rules.push({
    id: "well-formed",
    label: "Order sanity",
    status: wellFormed ? "pass" : "block",
    detail: wellFormed
      ? "Order is well formed."
      : !sized
        ? "Order has no size: set quantity or quoteOrderQty."
        : !limitPriced
          ? "LIMIT order is missing a price."
          : "Order resolves to zero notional.",
  });

  const blockers = rules.filter((r) => r.status === "block");
  const approvals = rules.filter((r) => r.status === "approval");

  const decision: Decision =
    blockers.length > 0
      ? "BLOCK"
      : approvals.length > 0
        ? "NEEDS_APPROVAL"
        : "ALLOW";

  const summary =
    decision === "BLOCK"
      ? `Blocked by ${blockers.length} rule${blockers.length > 1 ? "s" : ""}: ${blockers
          .map((r) => r.label.toLowerCase())
          .join(", ")}.`
      : decision === "NEEDS_APPROVAL"
        ? `Within policy but $${notionalUsd.toFixed(2)} needs a human sign-off.`
        : `Cleared all ${rules.length} checks at $${notionalUsd.toFixed(2)} notional.`;

  return { decision, notionalUsd, rules, summary };
}
