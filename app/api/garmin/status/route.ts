import type { NextRequest } from "next/server";
import { buildDashboard } from "@/lib/dashboard";
import { GarminAuthError } from "@/lib/garmin";

// Connection check: status and record counts only, never raw data.
export async function GET(_request: NextRequest) {
  try {
    const d = await buildDashboard();
    return Response.json({
      ok: true,
      counts: {
        wochen: d.weeks.length,
        vitalwerte: d.vitals.filter((v) => v.hrv !== null || v.restingHr !== null).length,
        schlaf: d.sleep.filter((s) => s.hours !== null).length,
        aktivitaeten: d.activities.length,
      },
    });
  } catch (err) {
    const auth = err instanceof GarminAuthError;
    return Response.json(
      { ok: false, error: auth ? err.message : "Garmin nicht erreichbar" },
      { status: auth ? 401 : 502 },
    );
  }
}
