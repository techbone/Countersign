"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { usd } from "@/lib/format";

/**
 * Equity is set by the operator, never by the agent. If an agent could report
 * its own balance it could inflate equity to escape its own drawdown breaker,
 * so this stays a human input — read the real Agentic sub-account balance and
 * type it in.
 */
export function EquityField({
  equity,
  onCommit,
}: {
  equity: number;
  onCommit: (equity: number, resetSession: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div>
        <p className="util text-dim">Equity</p>
        <button
          onClick={() => setEditing(true)}
          className="group mt-0.5 inline-flex items-center gap-1.5"
          title="Set from your Agentic sub-account balance"
        >
          <span className="font-display tnum text-sm font-bold text-fg">
            {usd(equity)}
          </span>
          <Pencil className="size-2.5 text-dim opacity-0 transition group-hover:opacity-100" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="util text-dim">Equity</p>
      <input
        autoFocus
        type="number"
        defaultValue={equity}
        className="tnum mt-0.5 w-full rounded-md border border-edge bg-ink px-1.5 py-0.5 text-sm text-fg outline-none focus:border-acid/50"
        onBlur={(e) => {
          const next = Number(e.target.value);
          setEditing(false);
          if (Number.isFinite(next) && next >= 0 && next !== equity) {
            onCommit(next, true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    </div>
  );
}
