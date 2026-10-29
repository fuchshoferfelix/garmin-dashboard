// Minimal Garmin Personal API client. Server-only: reads GARMIN_PERSONAL_API_KEY
// and must never be imported from a client component.
//
// Token exchange, base URL and paths follow Garmin's official Python client
// (garmin-connect-personal-api-python).

const BASE_URL = (
  process.env.GARMIN_PERSONAL_API_BASE_URL ?? "https://personal.connectapi.garmin.com"
).replace(/\/$/, "");
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const REFRESH_WINDOW_S = 60 * 60;
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 30_000;

// Per-call window limits (days), stricter than or equal to Garmin's maximums.
export const MAX_DAYS = { daily: 180, hrv: 180, sleep: 28, bodyBattery: 28, stats: 7, weight: 28 } as const;
export const MAX_ACTIVITIES_PER_PAGE = 60;

export class GarminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarminAuthError";
  }
}

export class GarminHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`Garmin antwortete mit HTTP ${status} (${path})`);
    this.name = "GarminHttpError";
    this.status = status;
  }
}

type Token = { value: string; expiresAt: number };
type CacheEntry = { at: number; value: Promise<unknown> };

const state = globalThis as unknown as {
  __garminToken?: Token;
  __garminCache?: Map<string, CacheEntry>;
};
const cache = (state.__garminCache ??= new Map());

function apiKey(): string {
  // GARMIN_API_KEY is accepted as an alias for existing .env.local files.
  const key = (process.env.GARMIN_PERSONAL_API_KEY ?? process.env.GARMIN_API_KEY)?.trim();
  if (!key) {
    throw new GarminAuthError(
      "Kein API-Key gefunden – trage GARMIN_PERSONAL_API_KEY in .env.local ein.",
    );
  }
  return key;
}

const INVALID_KEY =
  "Key ungültig oder abgelaufen – neuen Key in Garmin Connect erstellen und in .env.local eintragen.";

function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const exp = Number(payload.exp);
    if (Number.isFinite(exp)) return exp;
  } catch {
    // fall through
  }
  throw new Error("Garmin hat kein gültiges Token geliefert.");
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function bearer(forceRefresh = false): Promise<string> {
  const cached = state.__garminToken;
  if (!forceRefresh && cached && cached.expiresAt - Date.now() / 1000 > REFRESH_WINDOW_S) {
    return cached.value;
  }
  const res = await fetchWithTimeout(`${BASE_URL}${TOKEN_PATH}`, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${apiKey()}` },
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new GarminAuthError(INVALID_KEY);
  }
  if (!res.ok) throw new GarminHttpError(res.status, TOKEN_PATH);
  const value = (await res.text()).trim();
  state.__garminToken = { value, expiresAt: jwtExpiry(value) };
  return value;
}

async function request(path: string, params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (const attempt of [0, 1]) {
    const token = await bearer(attempt === 1);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      if (attempt === 0) continue;
      throw new GarminAuthError(INVALID_KEY);
    }
    if (!res.ok) throw new GarminHttpError(res.status, path);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  throw new GarminAuthError(INVALID_KEY);
}

/** GET with a 10-minute in-memory cache; concurrent identical calls share one request. */
function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const cacheKey = `${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;

  const value = request(path, params);
  cache.set(cacheKey, { at: Date.now(), value });
  value.catch(() => cache.delete(cacheKey));
  return value as Promise<T>;
}

// ---- date helpers -------------------------------------------------------

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number, from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() - n);
  return d;
}

/** Splits an inclusive date range into consecutive windows of at most maxDays days. */
export function windows(start: Date, end: Date, maxDays: number): [string, string][] {
  const out: [string, string][] = [];
  let from = start;
  while (from <= end) {
    const to = new Date(Math.min(daysAgo(-(maxDays - 1), from).getTime(), end.getTime()));
    out.push([isoDate(from), isoDate(to)]);
    from = daysAgo(-1, to);
  }
  return out;
}

async function inWindows<T>(
  start: Date,
  end: Date,
  maxDays: number,
  fetchWindow: (from: string, to: string) => Promise<T[] | null | undefined>,
): Promise<T[]> {
  const parts = await Promise.all(windows(start, end, maxDays).map(([a, b]) => fetchWindow(a, b)));
  return parts.flatMap((p) => p ?? []);
}

// ---- endpoints ----------------------------------------------------------

export function getDailySummaries(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.daily, async (startDate, endDate) => {
    const page = await get<{ data?: unknown[] } | null>("/usersummary-service/v2/dailysummaries", {
      startDate,
      endDate,
    });
    return page?.data;
  });
}

export function getHrvSummaries(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.hrv, async (from, to) => {
    const res = await get<unknown>(`/hrv-service/hrv/daily/${from}/${to}`);
    if (Array.isArray(res)) return res;
    const obj = res as { hrvSummaries?: unknown[]; data?: unknown[] } | null;
    return obj?.hrvSummaries ?? obj?.data;
  });
}

export function getSleepSummaries(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.sleep, async (startDate, endDate) => {
    const res = await get<unknown>("/sleep-service/sleep/dailySleepSummariesByDate", {
      startDate,
      endDate,
    });
    if (Array.isArray(res)) return res;
    const obj = res as { data?: unknown[] } | null;
    return obj?.data;
  });
}

export function getBodyBattery(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.bodyBattery, async (startDate, endDate) => {
    const res = await get<unknown>("/wellness-service/wellness/bodyBattery/reports/daily", {
      startDate,
      endDate,
      chunks: 1,
    });
    return Array.isArray(res) ? res : undefined;
  });
}

function rowsOf(res: unknown): unknown[] | undefined {
  if (Array.isArray(res)) return res;
  const obj = res as { data?: unknown[]; dailyWeightSummaries?: unknown[] } | null;
  return obj?.data ?? obj?.dailyWeightSummaries;
}

export function getDailySteps(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.stats, async (from, to) =>
    rowsOf(await get<unknown>(`/usersummary-service/stats/steps/daily/${from}/${to}`)),
  );
}

export function getDailyStress(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.stats, async (from, to) =>
    rowsOf(await get<unknown>(`/usersummary-service/stats/stress/daily/${from}/${to}`)),
  );
}

export function getWeight(start: Date, end: Date) {
  return inWindows(start, end, MAX_DAYS.weight, async (from, to) =>
    rowsOf(await get<unknown>(`/weight-service/weight/range/${from}/${to}`, { includeAll: "true" })),
  );
}

export function getHeartRateZones() {
  return get<unknown>("/biometric-service/heartRateZones/v2");
}

export function getFitnessAge(day: Date) {
  return get<unknown>(`/fitnessage-service/fitnessage/v2/${isoDate(day)}`);
}

export function getActivity(id: number) {
  return get<unknown>(`/activity-service/activity/${id}`);
}

/** Chart metrics and GPS polyline of one activity, already downsampled by Garmin. */
export function getActivityDetails(id: number, maxChartSize: number, maxPolylineSize: number) {
  return get<unknown>(`/activity-service/activity/${id}/details`, { maxChartSize, maxPolylineSize });
}

/** Activities in [start, end], newest first as returned by Garmin, paged by 60. */
export async function searchActivities(start: Date, end: Date, maxItems = 1000) {
  const out: unknown[] = [];
  for (let offset = 0; offset < maxItems; offset += MAX_ACTIVITIES_PER_PAGE) {
    const page = await get<unknown[] | null>("/activitylist-service/activities/search/activities", {
      start: offset,
      limit: MAX_ACTIVITIES_PER_PAGE,
      startDate: isoDate(start),
      endDate: isoDate(end),
    });
    const rows = page ?? [];
    out.push(...rows);
    if (rows.length < MAX_ACTIVITIES_PER_PAGE) break;
  }
  return out;
}
