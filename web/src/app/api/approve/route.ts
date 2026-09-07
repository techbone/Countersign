import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApproval } from "@/lib/sentinel/store";
import { parseBody, jsonError } from "../_shared";

export const dynamic = "force-dynamic";

const schema = z.object({
  verdictId: z.string().min(1),
  approve: z.boolean(),
  by: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const verdict = resolveApproval(
    parsed.data.verdictId,
    parsed.data.approve,
    parsed.data.by,
  );
  if (!verdict)
    return jsonError("No pending approval matches that verdict id.", 404);
  return NextResponse.json(verdict);
}
