"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { Ticker } from "@/lib/countersign/market";
import { usd } from "@/lib/format";

export function MarketStrip({ tickers }: { tickers: Ticker[] }) {
  if (tickers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {tickers.map((t) => {
        const up = t.priceChangePercent >= 0;
        const Icon = up ? TrendingUp : TrendingDown;
        return (
          <div key={t.symbol} className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-dim">
              {t.symbol.replace("USDT", "")}
            </span>
            <span className="tnum text-xs font-semibold text-fg">
              {usd(t.lastPrice, t.lastPrice > 100 ? 0 : 2)}
            </span>
            <span
              className={`tnum inline-flex items-center gap-0.5 text-[10px] ${up ? "text-acid" : "text-bad"}`}
            >
              <Icon className="size-2.5" />
              {Math.abs(t.priceChangePercent).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
