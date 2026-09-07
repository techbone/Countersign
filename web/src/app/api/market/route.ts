import { NextResponse } from "next/server";
import { getTickers } from "@/lib/sentinel/market";
import { getState } from "@/lib/sentinel/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const symbols = getState().policy.symbolAllowlist;
  try {
    return NextResponse.json({ tickers: await getTickers(symbols) });
  } catch {
    return NextResponse.json({ tickers: [], degraded: true });
  }
}
