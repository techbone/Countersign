import { NextResponse } from "next/server";
import { z } from "zod";
import { reconcile } from "@/lib/sentinel/store";
import { parseBody } from "../_shared";

export const dynamic = "force-dynamic";

const schema = z.object({
  trades: z.array(
    z.object({
      orderId: z.union([z.string(), z.number()]).transform(String),
      symbol: z.string(),
      side: z.string(),
      executedQty: z.number().nonnegative(),
      price: z.number().nonnegative(),
      time: z.number().optional(),
    }),
  ),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  return NextResponse.json(reconcile(parsed.data.trades));
}
