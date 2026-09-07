"use client";

import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  Gauge,
  Play,
  Power,
  Radio,
  Shield,
  ShieldAlert,
  TrendingDown,
  Waves,
  Zap,
} from "lucide-react";

import { useSentinel } from "@/lib/useSentinel";
import { Empty, Meter, Panel } from "@/components/primitives";
import { VerdictCard } from "@/components/VerdictCard";
import { PolicyPanel } from "@/components/PolicyPanel";
import { Ledger } from "@/components/Ledger";
import { MarketStrip } from "@/components/MarketStrip";
import { EquityField } from "@/components/EquityField";
import { num, pct, usd } from "@/lib/format";

export default function Dashboard() {
  const { state, report, tickers, live, post } = useSentinel();

  if (!state || !report) {
    return (
      <main className="dot-grid-dense flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-dim">
          <Shield className="size-4 animate-pulse" />
          Connecting to the control plane…
        </div>
      </main>
    );
  }

  const { policy, risk, verdicts, fills } = state;
  const lossToday = Math.max(0, -risk.realizedPnlToday);
  const openPositions = Object.values(risk.positions).filter(
    (p) => Math.abs(p.qty) > 0,
  );
  const pendingApprovals = verdicts.filter(
    (v) => v.decision === "NEEDS_APPROVAL" && !v.approvedAt && !v.rejectedAt,
  ).length;

  return (
    <main className="dot-grid-dense min-h-screen">
      {/* Halt banner — impossible to miss when the breaker has tripped. */}
      {risk.halted && (
        <div className="flex items-center justify-center gap-2 bg-bad px-4 py-1.5 text-center text-xs font-semibold text-ink">
          <ShieldAlert className="size-3.5" />
          TRADING HALTED — {risk.haltReason}
        </div>
      )}

      <header className="sticky top-0 z-10 border-b border-edge bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-80">
            <div className="rounded-lg border border-acid/30 bg-acid/10 p-1.5">
              <Shield className="size-4 text-acid" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="font-display text-sm font-bold leading-none tracking-tight text-fg">
                SENTINEL
              </h1>
              <p className="mt-1 util leading-none text-dim">
                Control plane
              </p>
            </div>
          </Link>

          <div className="ml-2 hidden h-7 w-px bg-edge md:block" />
          <MarketStrip tickers={tickers} />

          <div className="ml-auto flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-dim">
              <Radio
                className={`size-3 ${live ? "pulse-dot text-acid" : "text-bad"}`}
              />
              {live ? "live" : "reconnecting"}
            </span>

            <button
              onClick={() =>
                post("/api/halt", {
                  halted: !risk.halted,
                  reason: "Operator kill switch",
                })
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                risk.halted
                  ? "border-acid/40 bg-acid/10 text-acid hover:bg-acid/20"
                  : "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20"
              }`}
            >
              {risk.halted ? (
                <>
                  <Play className="size-3.5" /> Resume trading
                </>
              ) : (
                <>
                  <Power className="size-3.5" /> Kill switch
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-4 px-5 py-5">
        {/* Risk budgets */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Meter
            icon={TrendingDown}
            label="Daily loss"
            value={usd(lossToday)}
            limitLabel={`stop at ${usd(policy.dailyLossLimitUsd)}`}
            utilisation={lossToday / (policy.dailyLossLimitUsd || 1)}
          />
          <Meter
            icon={Waves}
            label="Drawdown"
            value={pct(report.drawdownPct, 2)}
            limitLabel={`breaker at ${pct(policy.maxDrawdownPct, 0)}`}
            utilisation={report.drawdownPct / (policy.maxDrawdownPct || 1)}
          />
          <Meter
            icon={CircleDollarSign}
            label="Daily budget"
            value={usd(risk.dailyNotionalUsd)}
            limitLabel={`of ${usd(policy.maxDailyNotionalUsd, 0)}`}
            utilisation={
              risk.dailyNotionalUsd / (policy.maxDailyNotionalUsd || 1)
            }
          />
          <Meter
            icon={Zap}
            label="Trade rate"
            value={`${report.tradesLastHour}/h`}
            limitLabel={`limit ${policy.maxTradesPerHour}/h`}
            utilisation={report.tradesLastHour / (policy.maxTradesPerHour || 1)}
          />
          <Meter
            icon={Boxes}
            label="Positions"
            value={String(openPositions.length)}
            limitLabel={`max ${policy.maxOpenPositions}`}
            utilisation={openPositions.length / (policy.maxOpenPositions || 1)}
          />
          <Meter
            icon={BadgeCheck}
            label="Attestation"
            value={pct(report.attestationCoveragePct, 0)}
            limitLabel={
              report.unattestedFills > 0
                ? `${report.unattestedFills} unattested`
                : "every fill authorised"
            }
            utilisation={report.attestationCoveragePct / 100}
            tone={report.unattestedFills > 0 ? "bad" : "good"}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          {/* Verdict stream */}
          <div className="space-y-4">
            <Panel
              title="Verdict stream"
              icon={Activity}
              action={
                <div className="flex items-center gap-2 text-[10px]">
                  {pendingApprovals > 0 && (
                    <span className="rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-semibold text-warn">
                      {pendingApprovals} awaiting approval
                    </span>
                  )}
                  <span className="text-acid">{report.verdictCounts.ALLOW ?? 0} allow</span>
                  <span className="text-bad">{report.verdictCounts.BLOCK ?? 0} block</span>
                </div>
              }
            >
              {verdicts.length === 0 ? (
                <Empty
                  icon={Shield}
                  text="No decisions yet. Ask your agent to trade — every intent lands here before it can reach Binance."
                />
              ) : (
                <div className="max-h-[560px] overflow-auto">
                  {verdicts.slice(0, 40).map((v) => (
                    <VerdictCard
                      key={v.id}
                      verdict={v}
                      onResolve={(verdictId, approve) =>
                        post("/api/approve", { verdictId, approve })
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Ledger fills={fills} />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <PolicyPanel
              policy={policy}
              onPatch={(patch) => post("/api/policy", patch, "PATCH")}
            />

            <Panel title="Account" icon={Gauge}>
              <div className="grid grid-cols-2 gap-3 p-4 text-xs">
                <EquityField
                  equity={risk.currentEquity}
                  onCommit={(equity, resetSession) =>
                    post("/api/equity", { equity, resetSession })
                  }
                />
                <Stat label="Session peak" value={usd(risk.peakEquity)} />
                <Stat
                  label="Realised P&L today"
                  value={usd(risk.realizedPnlToday)}
                  tone={risk.realizedPnlToday >= 0 ? "good" : "bad"}
                />
                <Stat label="Fills" value={String(report.fills)} />
              </div>

              {openPositions.length > 0 && (
                <div className="border-t border-edge px-4 py-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-dim">
                    Open positions
                  </p>
                  <ul className="space-y-1">
                    {openPositions.map((p) => (
                      <li
                        key={p.symbol}
                        className="tnum flex justify-between text-[11px]"
                      >
                        <span className="text-fg">{p.symbol}</span>
                        <span className="text-muted">
                          {num(p.qty, 6)} @ {usd(p.avgPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            {report.topBlockReasons.length > 0 && (
              <Panel title="Most-triggered rules" icon={ShieldAlert}>
                <ul className="space-y-2 p-4">
                  {report.topBlockReasons.map((r) => (
                    <li key={r.rule} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-[11px] text-muted">
                        {r.rule}
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
                        <div
                          className="h-full rounded-full bg-bad/70"
                          style={{
                            width: `${(r.count / report.topBlockReasons[0].count) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="tnum w-4 text-right text-[11px] text-dim">
                        {r.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-dim">{label}</p>
      <p
        className={`tnum mt-0.5 text-sm font-semibold ${
          tone === "good" ? "text-acid" : tone === "bad" ? "text-bad" : "text-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
