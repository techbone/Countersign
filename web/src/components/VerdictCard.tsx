"use client";

import { useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleCheck,
  CircleSlash,
  Fingerprint,
  Hourglass,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import type { Verdict } from "@/lib/countersign/types";
import { clock, usd } from "@/lib/format";
import { Chip } from "./primitives";

const DECISION = {
  ALLOW: {
    icon: ShieldCheck,
    label: "ALLOW",
    ring: "border-l-acid",
    text: "text-acid",
    bg: "bg-acid/10",
  },
  BLOCK: {
    icon: ShieldX,
    label: "BLOCK",
    ring: "border-l-bad",
    text: "text-bad",
    bg: "bg-bad/10",
  },
  NEEDS_APPROVAL: {
    icon: Hourglass,
    label: "APPROVAL",
    ring: "border-l-warn",
    text: "text-warn",
    bg: "bg-warn/10",
  },
} as const;

export function VerdictCard({
  verdict,
  onResolve,
}: {
  verdict: Verdict;
  onResolve: (id: string, approve: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = DECISION[verdict.decision];
  const Icon = d.icon;

  const blockers = verdict.rules.filter((r) => r.status === "block");
  const pending =
    verdict.decision === "NEEDS_APPROVAL" &&
    !verdict.approvedAt &&
    !verdict.rejectedAt;

  return (
    <article
      className={`slide-in border-l-2 ${d.ring} border-b border-b-edge bg-panel/40`}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-md p-1 ${d.bg}`}>
            <Icon className={`size-3.5 ${d.text}`} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`text-[11px] font-bold tracking-wider ${d.text}`}>
                {d.label}
              </span>
              <span className="text-sm font-semibold text-fg">
                {verdict.intent.side} {verdict.intent.symbol}
              </span>
              <span className="tnum text-xs text-muted">
                {usd(verdict.notionalUsd)}
              </span>
              <Chip>{verdict.intent.venue}</Chip>
              {verdict.consumedAt && (
                <Chip tone="good">
                  <Fingerprint className="size-2.5" /> attested
                </Chip>
              )}
              <span className="tnum ml-auto text-[10px] text-dim">
                {clock(verdict.createdAt)}
              </span>
            </div>

            <p className="mt-1 text-xs leading-relaxed text-muted">
              {verdict.summary}
            </p>

            <p className="mt-1 truncate text-[11px] italic text-dim">
              “{verdict.intent.rationale}”
            </p>

            {blockers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {blockers.map((r) => (
                  <Chip key={r.id} tone="bad">
                    <Ban className="size-2.5" />
                    {r.label}
                  </Chip>
                ))}
              </div>
            )}

            {pending && (
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => onResolve(verdict.id, true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-acid/40 bg-acid/10 px-2.5 py-1 text-[11px] font-semibold text-acid transition hover:bg-acid/20"
                >
                  <Check className="size-3" /> Approve
                </button>
                <button
                  onClick={() => onResolve(verdict.id, false)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-bad/40 bg-bad/10 px-2.5 py-1 text-[11px] font-semibold text-bad transition hover:bg-bad/20"
                >
                  <X className="size-3" /> Reject
                </button>
              </div>
            )}

            {verdict.approvedAt && (
              <div className="mt-2">
                <Chip tone="good">
                  <CircleCheck className="size-2.5" /> approved by{" "}
                  {verdict.approvedBy ?? "operator"}
                </Chip>
              </div>
            )}
            {verdict.rejectedAt && (
              <div className="mt-2">
                <Chip tone="bad">
                  <CircleSlash className="size-2.5" /> rejected by operator
                </Chip>
              </div>
            )}

            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-dim transition hover:text-muted"
            >
              <ChevronDown
                className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "hide" : "show"} all {verdict.rules.length} checks
            </button>

            {open && (
              <ul className="mt-2 space-y-1 border-t border-edge pt-2">
                {verdict.rules.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-[11px]">
                    <span
                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                        r.status === "block"
                          ? "bg-bad"
                          : r.status === "approval"
                            ? "bg-warn"
                            : "bg-acid/60"
                      }`}
                    />
                    <span className="w-32 shrink-0 text-dim">{r.label}</span>
                    <span className="text-muted">{r.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
