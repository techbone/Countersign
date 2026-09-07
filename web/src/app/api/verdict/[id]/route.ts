import { NextResponse } from "next/server";
import { getState } from "@/lib/countersign/store";

export const dynamic = "force-dynamic";

/** Read one verdict back by id — how an agent learns a human approved it. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const verdict = getState().verdicts.find((v) => v.id === id);
  if (!verdict) {
    return NextResponse.json({ error: "No verdict with that id." }, { status: 404 });
  }
  return NextResponse.json(verdict);
}
