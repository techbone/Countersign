// Live market context from Binance's public REST API. No auth required, which
// keeps the risk checks working even before an agent has been authorised.

const BASE = process.env.BINANCE_PUBLIC_API ?? "https://api.binance.com";

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fetcher();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export type Ticker = {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
};

export async function getTickers(symbols: string[]): Promise<Ticker[]> {
  if (symbols.length === 0) return [];
  const key = `tickers:${symbols.join(",")}`;
  return cached(key, 5_000, async () => {
    const param = encodeURIComponent(JSON.stringify(symbols));
    const res = await fetch(`${BASE}/api/v3/ticker/24hr?symbols=${param}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ticker request failed: ${res.status}`);
    const rows = (await res.json()) as Record<string, string>[];
    return rows.map((r) => ({
      symbol: r.symbol,
      lastPrice: Number(r.lastPrice),
      priceChangePercent: Number(r.priceChangePercent),
      highPrice: Number(r.highPrice),
      lowPrice: Number(r.lowPrice),
      quoteVolume: Number(r.quoteVolume),
    }));
  });
}

export async function getMarkPrice(symbol: string): Promise<number> {
  return cached(`price:${symbol}`, 3_000, async () => {
    const res = await fetch(
      `${BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`price request failed for ${symbol}`);
    const body = (await res.json()) as { price: string };
    return Number(body.price);
  });
}

/**
 * Realised volatility over the last hour, as a percentage: the standard
 * deviation of 1-minute log returns, scaled to the hour.
 */
export async function getVolatility1hPct(symbol: string): Promise<number> {
  return cached(`vol:${symbol}`, 30_000, async () => {
    const res = await fetch(
      `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=60`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`klines request failed for ${symbol}`);
    const rows = (await res.json()) as unknown[][];
    const closes = rows.map((r) => Number(r[4])).filter((n) => n > 0);
    if (closes.length < 3) return 0;

    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    // Per-minute sigma scaled to a 1h window by sqrt(60).
    return Math.sqrt(variance) * Math.sqrt(60) * 100;
  });
}

export type MarketSnapshot = { markPrice: number; volatility1hPct: number };

/**
 * Best-effort market context. Never throws — a risk decision must still be
 * possible when Binance's public API is slow or unreachable. One retry, because
 * the first request from a cold process regularly loses a race with DNS/TLS.
 */
export async function getMarketContext(
  symbol: string,
): Promise<MarketSnapshot & { degraded: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [markPrice, volatility1hPct] = await Promise.all([
        getMarkPrice(symbol),
        getVolatility1hPct(symbol),
      ]);
      return { markPrice, volatility1hPct, degraded: false };
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `[sentinel] market data unavailable for ${symbol}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return { markPrice: 0, volatility1hPct: 0, degraded: true };
}
