"use client";

import { useState } from "react";
import { Lock, SlidersHorizontal } from "lucide-react";
import type { Policy } from "@/lib/sentinel/types";
import { Panel } from "./primitives";

type Field = {
  key: keyof Policy;
  label: string;
  suffix?: string;
  step?: number;
};

const FIELDS: Field[] = [
  { key: "maxNotionalUsd", label: "Max per trade", suffix: "$" },
  { key: "maxDailyNotionalUsd", label: "Daily budget", suffix: "$" },
  { key: "approvalThresholdUsd", label: "Approval above", suffix: "$" },
  { key: "dailyLossLimitUsd", label: "Daily loss stop", suffix: "$" },
  { key: "maxDrawdownPct", label: "Drawdown breaker", suffix: "%" },
  { key: "maxLeverage", label: "Max leverage", suffix: "x" },
  { key: "cooldownSeconds", label: "Cooldown", suffix: "s" },
  { key: "maxTradesPerHour", label: "Trades / hour", suffix: "" },
  { key: "maxOpenPositions", label: "Open positions", suffix: "" },
  { key: "maxSymbolConcentrationPct", label: "Max concentration", suffix: "%" },
  { key: "maxVolatility1hPct", label: "Volatility ceiling", suffix: "%" },
];

export function PolicyPanel({
  policy,
  onPatch,
}: {
  policy: Policy;
  onPatch: (patch: Partial<Policy>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const symbolText = policy.symbolAllowlist.join(", ");

  const commit = (key: keyof Policy) => {
    const raw = draft[key];
    if (raw == null) return;
    const value = Number(raw);
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    if (!Number.isFinite(value) || value < 0) return;
    if (value === policy[key]) return;
    onPatch({ [key]: value } as Partial<Policy>);
  };

  return (
    <Panel
      title="Risk policy"
      icon={SlidersHorizontal}
      action={
        <span className="inline-flex items-center gap-1 text-[10px] text-dim">
          <Lock className="size-2.5" /> operator only
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4">
        {FIELDS.map((f) => (
          <label key={String(f.key)} className="block">
            <span className="text-[10px] uppercase tracking-wide text-dim">
              {f.label}
            </span>
            <div className="mt-1 flex items-center rounded-md border border-edge bg-ink px-2 py-1 focus-within:border-acid/50">
              {f.suffix === "$" && (
                <span className="mr-0.5 text-xs text-dim">$</span>
              )}
              <input
                type="number"
                className="tnum w-full bg-transparent text-xs text-fg outline-none"
                value={draft[f.key] ?? String(policy[f.key])}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
                onBlur={() => commit(f.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              {f.suffix && f.suffix !== "$" && (
                <span className="ml-0.5 text-xs text-dim">{f.suffix}</span>
              )}
            </div>
          </label>
        ))}

        <label className="col-span-2 block">
          <span className="text-[10px] uppercase tracking-wide text-dim">
            Symbol allowlist
          </span>
          {/* Uncontrolled and keyed on the committed value: it re-mounts when
              the policy changes upstream, so no prop-to-state sync effect. */}
          <input
            key={symbolText}
            defaultValue={symbolText}
            className="mt-1 w-full rounded-md border border-edge bg-ink px-2 py-1 text-xs text-fg outline-none focus:border-acid/50"
            onBlur={(e) => {
              const next = e.target.value
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
              if (next.join(",") !== policy.symbolAllowlist.join(",")) {
                onPatch({ symbolAllowlist: next });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
      </div>
    </Panel>
  );
}
