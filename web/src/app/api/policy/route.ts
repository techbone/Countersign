import { NextResponse } from "next/server";
import { z } from "zod";
import { getState, setPolicy } from "@/lib/countersign/store";
import { parseBody } from "../_shared";

export const dynamic = "force-dynamic";

const venue = z.enum(["spot", "margin", "usdm-futures", "coinm-futures"]);

const patchSchema = z
  .object({
    symbolAllowlist: z.array(z.string().min(1)).optional(),
    allowedVenues: z.array(venue).optional(),
    maxNotionalUsd: z.number().nonnegative().optional(),
    maxDailyNotionalUsd: z.number().nonnegative().optional(),
    maxLeverage: z.number().min(1).max(125).optional(),
    approvalThresholdUsd: z.number().nonnegative().optional(),
    dailyLossLimitUsd: z.number().nonnegative().optional(),
    maxDrawdownPct: z.number().min(0).max(100).optional(),
    cooldownSeconds: z.number().nonnegative().optional(),
    maxTradesPerHour: z.number().int().nonnegative().optional(),
    maxOpenPositions: z.number().int().nonnegative().optional(),
    maxSymbolConcentrationPct: z.number().min(0).max(100).optional(),
    maxVolatility1hPct: z.number().min(0).optional(),
  })
  .strict();

export async function GET() {
  return NextResponse.json(getState().policy);
}

export async function PATCH(req: Request) {
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const normalised = parsed.data.symbolAllowlist
    ? {
        ...parsed.data,
        symbolAllowlist: parsed.data.symbolAllowlist.map((s) =>
          s.toUpperCase(),
        ),
      }
    : parsed.data;
  return NextResponse.json(setPolicy(normalised));
}
