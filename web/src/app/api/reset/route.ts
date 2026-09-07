import { NextResponse } from "next/server";
import { z } from "zod";
import { resetSession } from "@/lib/countersign/store";
import { parseBody } from "../_shared";

export const dynamic = "force-dynamic";

const schema = z.object({ equity: z.number().positive().optional() });

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  return NextResponse.json(resetSession(parsed.data.equity ?? 1000));
}
