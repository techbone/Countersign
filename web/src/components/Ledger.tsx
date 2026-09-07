"use client";

import { Fingerprint, ScrollText, TriangleAlert } from "lucide-react";
import type { Fill } from "@/lib/sentinel/types";
import { clock, num, usd } from "@/lib/format";
import { Empty, Panel } from "./primitives";

export function Ledger({ fills }: { fills: Fill[] }) {
  const rogue = fills.filter((f) => !f.attested).length;

  return (
    <Panel
      title="Attestation ledger"
      icon={ScrollText}
      action={
        rogue > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-bad/40 bg-bad/10 px-1.5 py-0.5 text-[10px] font-semibold text-bad">
            <TriangleAlert className="size-2.5" /> {rogue} unattested
          </span>
        ) : (
          <span className="text-[10px] text-dim">{fills.length} fills</span>
        )
      }
    >
      {fills.length === 0 ? (
        <Empty
          icon={Fingerprint}
          text="No fills yet. Every executed order is recorded here with the token that authorised it."
        />
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-panel-2 text-[10px] uppercase tracking-wide text-dim">
              <tr>
                <th className="px-3 py-1.5 font-medium">Time</th>
                <th className="px-3 py-1.5 font-medium">Order</th>
                <th className="px-3 py-1.5 font-medium">Trade</th>
                <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                <th className="px-3 py-1.5 text-right font-medium">Price</th>
                <th className="px-3 py-1.5 text-right font-medium">Notional</th>
                <th className="px-3 py-1.5 font-medium">Attestation</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {fills.map((f) => (
                <tr
                  key={f.id}
                  className={`border-t border-edge ${!f.attested ? "bg-bad/5" : ""}`}
                >
                  <td className="px-3 py-1.5 text-dim">{clock(f.recordedAt)}</td>
                  <td className="px-3 py-1.5 font-mono text-dim">{f.orderId}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={f.side === "BUY" ? "text-acid" : "text-bad"}
                    >
                      {f.side}
                    </span>{" "}
                    <span className="text-fg">{f.symbol}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted">
                    {num(f.executedQty, 6)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted">
                    {usd(f.avgPrice)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-fg">
                    {usd(f.notionalUsd)}
                  </td>
                  <td className="px-3 py-1.5">
                    {f.attested ? (
                      <span className="inline-flex items-center gap-1 text-acid">
                        <Fingerprint className="size-2.5" />
                        {f.verdictId}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-bad">
                        <TriangleAlert className="size-2.5" /> UNATTESTED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
