import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmFill } from "@/lib/sentinel/store";
import { parseBody, jsonError } from "../_shared";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(8),
  orderId: z.union([z.string(), z.number()]).transform(String),
  executedQty: z.number().positive(),
  avgPrice: z.number().positive(),
  status: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const result = confirmFill(parsed.data);
  if (!result.ok) return jsonError(result.error, 409);
  return NextResponse.json(result.fill);
}
