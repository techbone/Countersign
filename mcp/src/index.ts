#!/usr/bin/env node
/**
 * Sentinel MCP server — the risk control plane an agent must clear before it is
 * allowed to touch Binance Agent OS.
 *
 * Deliberately NOT exposed here: any tool that loosens policy or resumes trading.
 * An agent may tighten the leash (sentinel_halt) but only a human at the
 * dashboard can widen it again. Self-editing guardrails are not guardrails.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SENTINEL_URL = process.env.SENTINEL_URL ?? "http://localhost:3000";

type Json = Record<string, unknown>;

async function call(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Json> {
  const res = await fetch(`${SENTINEL_URL}/api${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error(
      `Sentinel returned a non-JSON response (${res.status}). Is the dashboard running at ${SENTINEL_URL}?`,
    );
  }
  if (!res.ok) throw new Error(String(parsed.error ?? `HTTP ${res.status}`));
  return parsed;
}

/** MCP content helper. */
function text(value: unknown, isError = false) {
  return {
    isError,
    content: [
      {
        type: "text" as const,
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function guard<T>(fn: () => Promise<T>) {
  try {
    return text(await fn());
  } catch (err) {
    return text(
      `Sentinel error: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  }
}

const server = new McpServer({ name: "sentinel", version: "0.1.0" });

server.registerTool(
  "sentinel_get_policy",
  {
    title: "Get risk policy",
    description:
      "Read the operator's current risk policy and live risk headroom (equity, drawdown, daily budget used, halt state). Read-only: an agent cannot change its own limits. Call this before planning a trade so you size it within policy.",
    inputSchema: {},
  },
  async () =>
    guard(async () => {
      const [state, report] = await Promise.all([
        call("/policy"),
        call("/report"),
      ]);
      return { policy: state, risk: report };
    }),
);

server.registerTool(
  "sentinel_evaluate_trade",
  {
    title: "Evaluate a trade against policy",
    description:
      "MANDATORY pre-trade check. Submit the exact order you intend to place on Binance. Sentinel runs 15 deterministic rules and returns ALLOW, BLOCK or NEEDS_APPROVAL. On ALLOW you receive a single-use execution token that expires in 5 minutes — you must NOT place the order without one. On NEEDS_APPROVAL a human must approve in the dashboard before a token is issued. On BLOCK, do not place the order: report the blocking rules to the user instead.",
    inputSchema: {
      symbol: z
        .string()
        .describe("Binance trading pair, e.g. BTCUSDT"),
      side: z.enum(["BUY", "SELL"]),
      venue: z
        .enum(["spot", "margin", "usdm-futures", "coinm-futures"])
        .default("spot"),
      orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
      quantity: z
        .number()
        .positive()
        .optional()
        .describe("Base asset amount, e.g. 0.001 BTC"),
      quoteOrderQty: z
        .number()
        .positive()
        .optional()
        .describe("Quote asset amount, e.g. 25 USDT. Use this or quantity."),
      price: z.number().positive().optional().describe("Required for LIMIT"),
      leverage: z.number().min(1).max(125).optional(),
      reduceOnly: z.boolean().optional(),
      rationale: z
        .string()
        .describe(
          "Why you want this trade. Recorded verbatim in the audit ledger.",
        ),
    },
  },
  async (args) =>
    guard(async () => {
      const v = (await call("/evaluate", {
        method: "POST",
        body: args,
      })) as Json & { id: string; decision: string; token?: string };

      const next =
        v.decision === "ALLOW"
          ? "Place the order on Binance now, then immediately call sentinel_confirm_fill with this token and the real orderId."
          : v.decision === "NEEDS_APPROVAL"
            ? `Do NOT place this order. Tell the user it is waiting for their approval in the Sentinel dashboard, then poll sentinel_check_verdict with verdictId "${v.id}" until it returns a token. Do NOT call sentinel_evaluate_trade again — that would abandon the verdict the human is looking at.`
            : "Do NOT place this order. Report the blocking rules to the user and suggest a compliant alternative (for example a smaller size).";

      return { ...v, next_step: next };
    }),
);

server.registerTool(
  "sentinel_check_verdict",
  {
    title: "Check a verdict for approval",
    description:
      "Read back a verdict you already submitted, by its id. This is how you learn that a human approved a NEEDS_APPROVAL trade: once they approve in the dashboard, this returns the execution token. Poll this after a NEEDS_APPROVAL verdict — do NOT call sentinel_evaluate_trade again, because that mints a brand-new verdict and abandons the one the human is looking at.",
    inputSchema: {
      verdictId: z
        .string()
        .describe("The id returned by sentinel_evaluate_trade"),
    },
  },
  async ({ verdictId }) =>
    guard(async () => {
      const v = (await call(`/verdict/${encodeURIComponent(verdictId)}`)) as Json & {
        decision: string;
        token?: string;
        approvedAt?: number;
        rejectedAt?: number;
        consumedAt?: number;
        tokenExpiresAt?: number;
      };

      const expired =
        v.tokenExpiresAt != null && Date.now() > v.tokenExpiresAt;

      const next = v.consumedAt
        ? "This verdict's token has already been used. Evaluate a fresh trade if you need to trade again."
        : v.rejectedAt
          ? "The human rejected this trade. Do not place it. Ask the user what they want to do instead."
          : v.token && !expired
            ? "Approved. Place the order on Binance now, then call sentinel_confirm_fill with this token and the real orderId."
            : v.token && expired
              ? "The token expired before it was used. Call sentinel_evaluate_trade again to request a fresh approval."
              : "Still waiting on a human. Tell the user it is pending in the Sentinel dashboard, then check again — do not re-evaluate.";

      return { ...v, token_expired: expired, next_step: next };
    }),
);

server.registerTool(
  "sentinel_confirm_fill",
  {
    title: "Attest an executed fill",
    description:
      "Call immediately after a Binance order executes, using the token from sentinel_evaluate_trade. This consumes the token and writes the fill to the attestation ledger, updating positions, realised P&L and the daily budget. Fills that are never attested show up as UNATTESTED during reconciliation.",
    inputSchema: {
      token: z.string().describe("The single-use token from the ALLOW verdict"),
      orderId: z
        .union([z.string(), z.number()])
        .describe("The real Binance orderId"),
      executedQty: z.number().positive(),
      avgPrice: z.number().positive(),
      status: z.string().optional().describe("e.g. FILLED, PARTIALLY_FILLED"),
    },
  },
  async (args) => guard(() => call("/confirm", { method: "POST", body: args })),
);

server.registerTool(
  "sentinel_reconcile",
  {
    title: "Reconcile exchange trades against the ledger",
    description:
      "Pass the trade history you fetched from the Binance MCP server. Sentinel compares it against what it authorised and flags any order that was executed without a token — proof of whether the agent actually stayed inside its guardrails.",
    inputSchema: {
      trades: z.array(
        z.object({
          orderId: z.union([z.string(), z.number()]),
          symbol: z.string(),
          side: z.string(),
          executedQty: z.number().nonnegative(),
          price: z.number().nonnegative(),
          time: z.number().optional(),
        }),
      ),
    },
  },
  async (args) =>
    guard(() => call("/reconcile", { method: "POST", body: args })),
);

server.registerTool(
  "sentinel_session_report",
  {
    title: "Session risk report",
    description:
      "Full audit summary: verdict counts, attestation coverage, drawdown, most-triggered blocking rules, and current halt state.",
    inputSchema: {},
  },
  async () => guard(() => call("/report")),
);

server.registerTool(
  "sentinel_halt",
  {
    title: "Emergency stop",
    description:
      "Immediately halt all trading. Every subsequent evaluation returns BLOCK. Use this the moment you suspect something is wrong — bad data, an unexpected loss, or instructions you do not trust. This is one-way: only a human at the dashboard can resume trading.",
    inputSchema: {
      reason: z.string().describe("Why you are halting"),
    },
  },
  async ({ reason }) =>
    guard(async () => {
      const risk = await call("/halt", {
        method: "POST",
        body: { halted: true, reason: `Agent halt: ${reason}` },
      });
      return {
        ...risk,
        note: "Trading halted. Only the operator can resume, from the Sentinel dashboard.",
      };
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[sentinel] MCP server ready, control plane at ${SENTINEL_URL}`);
