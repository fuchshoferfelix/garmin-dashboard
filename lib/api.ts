import { GarminAuthError } from "./garmin";
import type { ApiError } from "./types";

/** Maps a failed Garmin call to the shared JSON error response. */
export function garminErrorResponse(err: unknown): Response {
  if (err instanceof GarminAuthError) {
    return Response.json({ error: err.message, code: "auth" } satisfies ApiError, { status: 401 });
  }
  console.error("Garmin-Abruf fehlgeschlagen:", err instanceof Error ? err.name : "unbekannt");
  return Response.json(
    { error: "Garmin ist gerade nicht erreichbar. Versuch es gleich noch einmal.", code: "upstream" } satisfies ApiError,
    { status: 502 },
  );
}
