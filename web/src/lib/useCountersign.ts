"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CountersignState } from "./countersign/types";
import type { Ticker } from "./countersign/market";

type Report = {
  verdictCounts: Record<string, number>;
  totalVerdicts: number;
  fills: number;
  unattestedFills: number;
  attestationCoveragePct: number;
  drawdownPct: number;
  tradesLastHour: number;
  topBlockReasons: { rule: string; count: number }[];
};

export function useCountersign() {
  const [state, setState] = useState<CountersignState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, r] = await Promise.all([
        fetch("/api/state", { cache: "no-store" }).then((x) => x.json()),
        fetch("/api/report", { cache: "no-store" }).then((x) => x.json()),
      ]);
      setState(s);
      setReport(r);
    } catch {
      // Transient — the event stream or the next poll will catch us up.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Control plane: load once, then let the server push every change.
  useEffect(() => {
    let es: EventSource | undefined;

    // Deferred so the first paint is never blocked by a state update.
    const timer = setTimeout(() => {
      void refresh();
      es = new EventSource("/api/events");
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string };
          if (event.type === "ping") return;
          void refresh();
        } catch {
          // Ignore malformed frames.
        }
      };
    }, 0);

    return () => {
      clearTimeout(timer);
      es?.close();
    };
  }, [refresh]);

  // Market prices poll independently of the control-plane events.
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await fetch("/api/market", { cache: "no-store" });
        const body = (await r.json()) as { tickers?: Ticker[] };
        if (alive) setTickers(body.tickers ?? []);
      } catch {
        // Leave the last known prices on screen.
      }
    };

    const timer = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 8000);

    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, []);

  const post = useCallback(
    async (path: string, body: unknown, method = "POST") => {
      await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
    },
    [refresh],
  );

  return { state, report, tickers, live, refresh, post };
}
