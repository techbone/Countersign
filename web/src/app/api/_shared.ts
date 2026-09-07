import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

/** Parse a request body against a schema, returning a typed value or a 400. */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError("Request body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      response: jsonError(
        `${issue.path.join(".") || "body"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
