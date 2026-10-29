// Server-only: GPS tracks and detail series from Garmin's activity details.
import {
  daysAgo,
  GarminAuthError,
  getActivityDetails,
  searchActivities,
} from "./garmin";
import type { ActivityDetail, DetailPoint, Heatmap, LatLon } from "./types";

const HEATMAP_MONTHS = 12;
const HEATMAP_MAX_RUNS = 150;
const HEATMAP_POINTS = 120;
const DETAIL_POINTS = 300;
const CONCURRENCY = 4;
// Outdoor runs only: treadmill and virtual runs have no real GPS track.
const OUTDOOR_RUN_KEYS = new Set(["running", "trail_running", "track_running"]);

function pick(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

function haversineM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseTrack(raw: unknown): LatLon[] {
  const poly = pick(raw, "geoPolylineDTO", "polyline");
  if (!Array.isArray(poly)) return [];
  const out: LatLon[] = [];
  for (const p of poly) {
    const lat = num(pick(p, "lat"));
    const lon = num(pick(p, "lon"));
    if (lat === null || lon === null || (lat === 0 && lon === 0)) continue;
    out.push([round5(lat), round5(lon)]);
  }
  return out;
}

function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

/** Cumulative metres along the track, for placing chart samples on the map. */
function cumulative(track: LatLon[]): number[] {
  const out = [0];
  for (let i = 1; i < track.length; i++) out.push(out[i - 1] + haversineM(track[i - 1], track[i]));
  return out;
}

function positionAt(track: LatLon[], cum: number[], meters: number): LatLon {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < meters) lo = mid + 1;
    else hi = mid;
  }
  return track[lo];
}

export function parseDetail(id: number, raw: unknown): ActivityDetail {
  const track = parseTrack(raw);
  const cum = cumulative(track);
  const trackLength = cum[cum.length - 1] ?? 0;

  const descriptors = pick(raw, "metricDescriptors");
  const index = new Map<string, number>();
  if (Array.isArray(descriptors)) {
    for (const d of descriptors) {
      const key = pick(d, "key");
      const at = num(pick(d, "metricsIndex"));
      if (typeof key === "string" && at !== null) index.set(key, at);
    }
  }
  const rows = pick(raw, "activityDetailMetrics");
  const metricRows: unknown[] = Array.isArray(rows) ? rows : [];
  const col = (row: unknown, ...keys: string[]): number | null => {
    for (const key of keys) {
      const at = index.get(key);
      if (at === undefined) continue;
      const v = num(pick(row, "metrics", String(at)));
      if (v !== null) return v;
    }
    return null;
  };

  const totalM = metricRows.reduce<number>((max, r) => Math.max(max, col(r, "sumDistance") ?? 0), 0);
  const points: DetailPoint[] = [];
  for (const row of thin(metricRows, DETAIL_POINTS)) {
    const meters = col(row, "sumDistance");
    if (meters === null) continue;
    const speed = col(row, "directSpeed");
    const lat = col(row, "directLatitude");
    const lon = col(row, "directLongitude");
    let pos: LatLon | null = lat !== null && lon !== null ? [lat, lon] : null;
    if (pos === null && track.length > 1 && totalM > 0) {
      pos = positionAt(track, cum, (meters / totalM) * trackLength);
    }
    points.push({
      km: meters / 1000,
      t: col(row, "sumDuration", "sumElapsedDuration") ?? 0,
      lat: pos ? pos[0] : null,
      lon: pos ? pos[1] : null,
      ele: col(row, "directElevation", "directCorrectedElevation"),
      hr: col(row, "directHeartRate"),
      kmh: speed !== null && speed > 0.3 ? speed * 3.6 : null,
      cadence: col(row, "directRunCadence", "directBikeCadence"),
    });
  }

  return { id, track: thin(track, 600), points };
}

export async function getActivityDetail(id: number): Promise<ActivityDetail> {
  return parseDetail(id, await getActivityDetails(id, DETAIL_POINTS, 600));
}

/** Runs the tasks with at most `limit` in flight; skips failures except auth errors. */
async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        out.push(await task(item));
      } catch (err) {
        if (err instanceof GarminAuthError) throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

export async function buildHeatmap(): Promise<Heatmap> {
  const today = new Date();
  const start = daysAgo(HEATMAP_MONTHS * 30 + 5);
  const rawActivities = await searchActivities(start, today, 1500);

  const ids = rawActivities
    .filter((a) => OUTDOOR_RUN_KEYS.has(String(pick(a, "activityType", "typeKey"))))
    .filter((a) => pick(a, "hasPolyline") !== false)
    .sort((a, b) => String(pick(b, "startTimeLocal")).localeCompare(String(pick(a, "startTimeLocal"))))
    .slice(0, HEATMAP_MAX_RUNS)
    .map((a) => num(pick(a, "activityId")))
    .filter((id): id is number => id !== null);

  const tracks = await pool(ids, CONCURRENCY, async (id) =>
    thin(parseTrack(await getActivityDetails(id, 10, HEATMAP_POINTS)), HEATMAP_POINTS),
  );
  const routes = tracks.filter((t) => t.length >= 2);
  const km = routes.reduce((sum, r) => sum + cumulative(r)[r.length - 1] / 1000, 0);

  return { routes, runs: routes.length, km: Math.round(km * 10) / 10, months: HEATMAP_MONTHS };
}
