<div align="center">

# 🛡️ Sentinel

**The risk control plane for Binance Agent OS.**

Policy enforcement, human-in-the-loop approval, and cryptographic trade
attestation for AI agents that trade real money.

*Binance Agent OS Mini Hackathon — Track A*

</div>

---

## The problem

When Binance shipped Agent OS, TechCrunch's headline was:

> *"Binance now lets AI agents trade, but keeping them in check is largely up to users."*

That is accurate. Agent OS gives an LLM spot, margin, Convert and futures
execution inside an Agentic sub-account. It correctly refuses to let an agent
withdraw funds — but **inside** that sub-account, nothing stops a confused,
looping, or prompt-injected model from sizing 40× too large, piling into an
illiquid pair at 25× leverage, or revenge-trading a drawdown into the ground.

"Set a spending limit" is not a risk system. A risk system has to answer three
questions:

1. **Should this specific trade be allowed, right now?**
2. **Who signed off on it?**
3. **Can you prove afterwards that the agent actually obeyed?**

Sentinel answers all three.

## What it is

Sentinel sits between your agent and Binance as a second MCP server. The agent
must clear policy *before* it is allowed to place an order, and must attest the
fill *after*.

```
                    ┌────────────────────────────────────────┐
                    │        Claude Code  (the agent)        │
                    └───────┬────────────────────────┬───────┘
                            │                        │
              1. evaluate   │                        │  3. place order
                 (mandatory)│                        │     (needs token)
                            ▼                        ▼
        ┌───────────────────────────────┐   ┌──────────────────────┐
        │   sentinel  (MCP, local)      │   │  binance  (MCP, HTTP)│
        │                               │   │  agent.binance.com   │
        │  ┌─────────────────────────┐  │   │  OAuth 2.1 + PKCE    │
        │  │  15-rule policy engine  │  │   │  Agentic sub-account │
        │  │  deterministic, pure    │  │   └──────────┬───────────┘
        │  └───────────┬─────────────┘  │              │
        │              ▼                │              │
        │  ALLOW → single-use token ────┼──────────────┘
        │  NEEDS_APPROVAL → human       │   4. confirm_fill(token, orderId)
        │  BLOCK → refused              │              │
        │                               │◄─────────────┘
        │  ┌─────────────────────────┐  │
        │  │  attestation ledger     │  │   5. reconcile vs exchange history
        │  │  HMAC, single-use       │  │      → any order with no token
        │  └───────────┬─────────────┘  │        is flagged UNATTESTED
        └──────────────┼────────────────┘
                       ▼
        ┌───────────────────────────────────────────────┐
        │  Live dashboard — localhost:3000              │
        │  risk gauges · verdict stream · approvals ·   │
        │  policy editor · audit ledger · kill switch   │
        └───────────────────────────────────────────────┘
```

### Why this is enforcement, not vibes

Most "AI guardrail" demos are a paragraph in a system prompt. A model that
ignores the paragraph fails silently and nobody finds out. Sentinel is built so
that **non-compliance is detectable after the fact**:

- Every `ALLOW` mints an **HMAC-signed, single-use token** bound to that verdict,
  expiring in 5 minutes.
- `sentinel_confirm_fill` refuses a forged token, an expired token, and a replayed
  token.
- `sentinel_reconcile` takes the trade history straight from the Binance MCP
  server and diffs it against the ledger. **Any order that reached the exchange
  without a token is permanently recorded as `UNATTESTED`** and the dashboard
  shows attestation coverage below 100%.

So the guarantee is not "the agent promised to behave." It is: *if the agent
misbehaves, you have proof, on the same screen, in the same session.*

### The policy is deliberately read-only to the agent

The Sentinel MCP server exposes **no tool that widens a limit or resumes trading.**
An agent can `sentinel_halt` — tightening the leash, one-way — but only a human
at the dashboard can raise a cap or resume after a breaker trips. Guardrails an
agent can edit are not guardrails.

## The 15 rules

Every rule runs on every intent; nothing short-circuits, so the dashboard can
show what passed as well as what failed.

| # | Rule | Blocks when |
|---|------|-------------|
| 1 | Kill switch | Trading is halted by operator, agent, or a tripped breaker |
| 2 | Symbol allowlist | Pair is not explicitly permitted |
| 3 | Venue | Venue not permitted (e.g. futures off by default) |
| 4 | Per-trade notional | Single order exceeds its USD cap |
| 5 | Daily notional budget | Cumulative daily turnover would be exceeded |
| 6 | Leverage | Requested leverage above ceiling |
| 7 | Daily loss limit | Realised loss today hit the stop |
| 8 | Drawdown breaker | Equity fell too far from session peak |
| 9 | Cooldown | Too soon after the last accepted trade |
| 10 | Trade rate | Too many trades this hour — the runaway-loop guard |
| 11 | Open positions | Too many concurrent positions |
| 12 | Concentration | One symbol would dominate the book |
| 13 | Volatility guard | 1h realised volatility above ceiling (live klines) |
| 14 | Human approval | Notional at/above the approval threshold → human click |
| 15 | Order sanity | Malformed, unsized, or zero-notional order |

Rules 7 and 8 also **auto-halt** the moment a fill breaches them, rather than
waiting for the agent to ask permission for its next trade.

## Quickstart

Requires Node 20+.

```bash
# 1. install
cd web && npm install && cd ../mcp && npm install && npm run build && cd ..

# 2. start the control plane (dashboard + policy API)
cd web && npm run dev          # landing → http://localhost:3000
                               # control plane → /dashboard

# 3. connect the agent (from the repo root, in another terminal)
claude
```

`.mcp.json` in the repo root registers both servers, so Claude Code picks them
up automatically:

| Server | Transport | Purpose |
|---|---|---|
| `binance` | HTTP → `https://agent.binance.com/mcp/agentic` | Real execution. Browser OAuth on first use. |
| `sentinel` | stdio → `./mcp/dist/index.js` | Policy, approval, attestation. |

On first use Binance opens a consent screen. Grant **market data**, **account**
and **trade**; Agent OS has no withdrawal scope at all, so funds can never leave
your Agentic sub-account.

[`CLAUDE.md`](CLAUDE.md) is the agent contract that binds the workflow — it is
loaded automatically by Claude Code.

### See it work without any account

```bash
node scripts/demo.mjs
```

Seeds a full session through the same public API the MCP server uses — a
compliant trade that gets attested, an oversized order, a leveraged shitcoin
punt, a trade parked for human approval, and a rogue fill caught by
reconciliation. Then open http://localhost:3000/dashboard.

## MCP tools

| Tool | Purpose |
|---|---|
| `sentinel_get_policy` | Read limits and live headroom. Read-only. |
| `sentinel_evaluate_trade` | **Mandatory pre-trade check.** Returns ALLOW / BLOCK / NEEDS_APPROVAL. |
| `sentinel_confirm_fill` | Attest an executed fill against its single-use token. |
| `sentinel_reconcile` | Diff exchange history against the ledger; flag unattested orders. |
| `sentinel_session_report` | Verdict counts, attestation coverage, drawdown, top blocking rules. |
| `sentinel_halt` | Emergency stop. One-way — only a human resumes. |

## Layout

```
web/                      Next.js 16 dashboard + policy API (the control plane)
  src/lib/sentinel/
    policy.ts             the 15 rules — pure, deterministic, no network
    store.ts              state, HMAC tokens, attestation ledger, SSE bus
    market.ts             live prices + realised volatility (public API, no auth)
  src/app/api/            evaluate · confirm · approve · halt · reconcile · report · events
  src/components/         verdict stream, policy editor, ledger, gauges
mcp/                      Sentinel MCP server (stdio)
scripts/demo.mjs          seeds a full session for the demo
CLAUDE.md                 the agent contract
.mcp.json                 registers both MCP servers
```

The policy engine is a pure function of `(intent, policy, risk, market)`. Same
inputs, same verdict, every time — no model in the decision path.

## Notes and limits

- State lives in `web/.sentinel/state.json` — fine for a hackathon and a single
  operator; a real deployment wants a database and per-agent identity.
- Equity is seeded by the operator (`POST /api/equity`) or from the demo script.
  Wiring it to live sub-account balances is the obvious next step.
- Reconciliation is only as good as the history you feed it. In production it
  should poll the Binance MCP server on a timer rather than on request.
- The dashboard has no auth. It binds to localhost and is a local operator tool.

---

**Not financial advice.** This is hackathon software for a demo trade of a few
dollars. Do not point it at meaningful capital.
