import type { NextRequest } from "next/server";
import { garminErrorResponse } from "@/lib/api";
import { buildHeatmap } from "@/lib/routes";

export async function GET(_request: NextRequest) {
  try {
    return Response.json(await buildHeatmap(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return garminErrorResponse(err);
  }
}
