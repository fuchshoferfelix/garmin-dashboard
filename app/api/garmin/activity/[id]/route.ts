import type { NextRequest } from "next/server";
import { garminErrorResponse } from "@/lib/api";
import { getActivityDetail } from "@/lib/routes";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/garmin/activity/[id]">) {
  const { id } = await ctx.params;
  // The id ends up in an upstream URL path, so accept digits only.
  if (!/^\d{1,15}$/.test(id)) {
    return Response.json({ error: "Ungültige Aktivitäts-ID.", code: "upstream" }, { status: 400 });
  }
  try {
    return Response.json(await getActivityDetail(Number(id)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return garminErrorResponse(err);
  }
}
