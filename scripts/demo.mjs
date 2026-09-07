#!/usr/bin/env node
/**
 * Seeds a realistic Sentinel session so the dashboard has something to show.
 * Everything here goes through the same public API the MCP server uses —
 * there is no privileged back door.
 *
 *   node scripts/demo.mjs
 */

const BASE = process.env.SENTINEL_URL ?? "http://localhost:3000";

const api = async (path, body, method = "POST") => {
  const res = await fetch(`${BASE}/api${path}`, {
    method: body ? method : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
};

const evaluate = (intent) => api("/evaluate", intent);
const step = (n, msg) => console.log(`\n\x1b[33m${n}.\x1b[0m ${msg}`);
const show = (v) => {
  const colour =
    v.decision === "ALLOW" ? "\x1b[32m" : v.decision === "BLOCK" ? "\x1b[31m" : "\x1b[33m";
  console.log(`   ${colour}${v.decision}\x1b[0m — ${v.summary}`);
};

console.log("\x1b[1mSentinel demo — seeding a session\x1b[0m");

await api("/reset", { equity: 500 });
// Cooldown off while seeding so the script does not block itself.
const saved = await api("/policy");
await api("/policy", { cooldownSeconds: 0 }, "PATCH");

step(1, "Agent proposes a small, compliant buy");
const ok = await evaluate({
  symbol: "BTCUSDT",
  side: "BUY",
  orderType: "MARKET",
  quoteOrderQty: 8,
  rationale: "Funding flipped negative; small long into support at the 4h VWAP.",
});
show(ok);

let goodOrderId = null;
let goodQty = 0;
let goodPrice = 0;
if (ok.token) {
  goodPrice = ok.markPrice || 79000;
  goodQty = 8 / goodPrice;
  goodOrderId = `DEMO-${Date.now()}`;
  await api("/confirm", {
    token: ok.token,
    orderId: goodOrderId,
    executedQty: goodQty,
    avgPrice: goodPrice,
    status: "FILLED",
  });
  console.log("   \x1b[32m✓\x1b[0m fill attested against token");
}

step(2, "Agent tries to size 40x over the per-trade cap");
show(
  await evaluate({
    symbol: "BTCUSDT",
    side: "BUY",
    orderType: "MARKET",
    quoteOrderQty: 1000,
    rationale: "High conviction, going big.",
  }),
);

step(3, "Agent tries an unlisted symbol on leveraged futures");
show(
  await evaluate({
    venue: "usdm-futures",
    symbol: "PEPEUSDT",
    side: "BUY",
    orderType: "MARKET",
    quoteOrderQty: 20,
    leverage: 25,
    rationale: "Saw a signal on social media.",
  }),
);

step(4, "Agent proposes a trade above the human-approval threshold");
show(
  await evaluate({
    symbol: "ETHUSDT",
    side: "BUY",
    orderType: "MARKET",
    quoteOrderQty: 18,
    rationale: "Rotating a slice of the book into ETH.",
  }),
);
console.log("   \x1b[33m→\x1b[0m waiting for a human click in the dashboard");

step(5, "Reconciling against exchange history — one order bypassed Sentinel");
const history = [
  {
    orderId: "ROGUE-4417",
    symbol: "BTCUSDT",
    side: "BUY",
    executedQty: 0.05,
    price: ok.markPrice || 79000,
  },
];
// Include the order Sentinel did authorise, so coverage is a real ratio.
if (goodOrderId) {
  history.unshift({
    orderId: goodOrderId,
    symbol: "BTCUSDT",
    side: "BUY",
    executedQty: goodQty,
    price: goodPrice,
  });
}
const rec = await api("/reconcile", { trades: history });
console.log(
  `   \x1b[31m✗\x1b[0m ${rec.unattested.length} of ${rec.checked} orders were never authorised — attestation coverage ${rec.coveragePct.toFixed(0)}%`,
);

await api("/policy", { cooldownSeconds: saved.cooldownSeconds }, "PATCH");
console.log(`\n\x1b[1mDone.\x1b[0m Open ${BASE}/dashboard to see the control plane.\n`);
