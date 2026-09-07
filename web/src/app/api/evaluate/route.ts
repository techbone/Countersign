import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateIntent } from "@/lib/countersign/store";
import { parseBody } from "../_shared";

export const dynamic = "force-dynamic";

const intentSchema = z
  .object({
    venue: z
      .enum(["spot", "margin", "usdm-futures", "coinm-futures"])
      .default("spot"),
    symbol: z.string().min(3),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
    quantity: z.number().positive().optional(),
    quoteOrderQty: z.number().positive().optional(),
    price: z.number().positive().optional(),
    leverage: z.number().min(1).max(125).optional(),
    reduceOnly: z.boolean().optional(),
    rationale: z.string().min(1, "the agent must state a reason"),
  })
  .refine((v) => v.quantity != null || v.quoteOrderQty != null, {
    message: "provide either quantity or quoteOrderQty",
    path: ["quantity"],
  });

export async function POST(req: Request) {
  const parsed = await parseBody(req, intentSchema);
  if (!parsed.ok) return parsed.response;
  const verdict = await evaluateIntent(parsed.data);
  return NextResponse.json(verdict);
}
