import type { NextRequest } from "next/server";
import { buildDashboard } from "@/lib/dashboard";
import { GarminAuthError } from "@/lib/garmin";
import type { ApiError } from "@/lib/types";

export async function GET(_request: NextRequest) {
  try {
    return Response.json(await buildDashboard(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof GarminAuthError) {
      return Response.json({ error: err.message, code: "auth" } satisfies ApiError, { status: 401 });
    }
    console.error("Garmin-Abruf fehlgeschlagen:", err instanceof Error ? err.name : "unbekannt");
    return Response.json(
      { error: "Garmin ist gerade nicht erreichbar. Versuch es gleich noch einmal.", code: "upstream" } satisfies ApiError,
      { status: 502 },
    );
  }
}
