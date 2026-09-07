import { NextResponse } from "next/server";
import { z } from "zod";
import { setHalted } from "@/lib/sentinel/store";
import { parseBody } from "../_shared";

export const dynamic = "force-dynamic";

const schema = z.object({
  halted: z.boolean(),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  return NextResponse.json(
    setHalted(parsed.data.halted, parsed.data.reason),
  );
}
