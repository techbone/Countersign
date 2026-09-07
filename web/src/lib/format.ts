export const usd = (n: number, dp = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (n: number, dp = 1) => `${n.toFixed(dp)}%`;

export const num = (n: number, dp = 4) =>
  n.toLocaleString("en-US", { maximumFractionDigits: dp });

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-GB", { hour12: false });

export const ago = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
