import {
  daysAgo,
  GarminAuthError,
  getDailySteps,
  getDailyStress,
  getDailySummaries,
  getHeartRateZones,
  getHrvSummaries,
  getSleepSummaries,
  getWeight,
  isoDate,
  searchActivities,
} from "./garmin";
import type {
  ActivityRow,
  BodyBatteryPoint,
  DashboardData,
  HeaderMetric,
  HrZones,
  SleepPoint,
  StepsPoint,
  StressPoint,
  TrainingWeek,
  VitalsPoint,
  WeightPoint,
} from "./types";

const WEEKS = 16;
const VITALS_DAYS = 60;
const SLEEP_DAYS = 28;
const ACTIVITY_MONTHS = 6;
const WEIGHT_DAYS = 90;
const RUN_KEYS = new Set(["running", "trail_running", "treadmill_running", "track_running", "virtual_run"]);

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

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return daysAgo(offset, d);
}

/** Newest record that has a value for the given extractor. */
function latest(
  rows: unknown[],
  date: (r: unknown) => string | null,
  value: (r: unknown) => number | null,
): HeaderMetric {
  let best: HeaderMetric = null;
  for (const row of rows) {
    const d = date(row);
    const v = value(row);
    if (d === null || v === null) continue;
    if (best === null || d > best.date) best = { value: v, date: d };
  }
  return best;
}

/** Extra data should not take the whole dashboard down; auth errors still do. */
async function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof GarminAuthError) throw err;
    return fallback;
  }
}

function toActivity(raw: unknown): ActivityRow | null {
  const id = num(pick(raw, "activityId"));
  const start = str(pick(raw, "startTimeLocal"));
  if (id === null || start === null) return null;

  const distanceM = num(pick(raw, "distance"));
  const durationS = num(pick(raw, "duration")) ?? 0;
  const distanceKm = distanceM !== null && distanceM > 0 ? distanceM / 1000 : null;
  const speed = num(pick(raw, "averageSpeed"));

  return {
    id,
    sportKey: str(pick(raw, "activityType", "typeKey")) ?? "other",
    name: str(pick(raw, "activityName")) ?? "",
    start,
    distanceKm,
    durationS,
    paceSecPerKm: distanceKm !== null && durationS > 0 ? durationS / distanceKm : null,
    powerW: num(pick(raw, "avgPower")),
    speedKmh: speed !== null && speed > 0 ? speed * 3.6 : null,
    avgHr: num(pick(raw, "averageHR")),
    elevationGain: num(pick(raw, "elevationGain")),
    trainingLoad: num(pick(raw, "activityTrainingLoad")),
    cadence: num(pick(raw, "averageRunningCadenceInStepsPerMinute")),
    zoneSeconds: [1, 2, 3, 4, 5].every((z) => num(pick(raw, `hrTimeInZone_${z}`)) !== null)
      ? [1, 2, 3, 4, 5].map((z) => num(pick(raw, `hrTimeInZone_${z}`)) ?? 0)
      : null,
  };
}

export async function buildDashboard(): Promise<DashboardData> {
  const today = new Date();
  const firstWeek = daysAgo((WEEKS - 1) * 7, mondayOf(today));
  const activityStart = new Date(today.getFullYear(), today.getMonth() - (ACTIVITY_MONTHS - 1), 1);

  const [daily, hrv, sleep, rawActivities, rawSteps, rawStress, rawWeight, rawZones] = await Promise.all([
    getDailySummaries(daysAgo(VITALS_DAYS - 1), today),
    getHrvSummaries(daysAgo(VITALS_DAYS - 1), today),
    getSleepSummaries(daysAgo(SLEEP_DAYS - 1), today),
    searchActivities(activityStart, today, 1200),
    optional(getDailySteps(daysAgo(VITALS_DAYS - 1), today), []),
    optional(getDailyStress(daysAgo(VITALS_DAYS - 1), today), []),
    optional(getWeight(daysAgo(WEIGHT_DAYS - 1), today), []),
    optional(getHeartRateZones(), null),
  ]);

  const dailyDate = (r: unknown) => str(pick(r, "calendarDate"));

  // --- header ---
  const header = {
    restingHr: latest(daily, dailyDate, (r) => num(pick(r, "heartRate", "restingValue"))),
    hrv: latest(hrv, dailyDate, (r) => num(pick(r, "lastNightAvg"))),
    sleepScore: latest(sleep, dailyDate, (r) => num(pick(r, "sleepScores", "overall", "value"))),
    bodyBattery: latest(daily, dailyDate, (r) => num(pick(r, "bodyBattery", "latestValue"))),
  };

  // --- vitals (HRV + resting HR), one point per day ---
  const hrvByDay = new Map(hrv.map((r) => [dailyDate(r), num(pick(r, "lastNightAvg"))]));
  const rhrByDay = new Map(daily.map((r) => [dailyDate(r), num(pick(r, "heartRate", "restingValue"))]));
  const vitals: VitalsPoint[] = [];
  for (let i = VITALS_DAYS - 1; i >= 0; i--) {
    const date = isoDate(daysAgo(i));
    vitals.push({ date, hrv: hrvByDay.get(date) ?? null, restingHr: rhrByDay.get(date) ?? null });
  }

  const newestHrv = [...hrv].sort((a, b) => (dailyDate(b) ?? "").localeCompare(dailyDate(a) ?? ""))[0];
  const low = num(pick(newestHrv, "baseline", "balancedLow"));
  const high = num(pick(newestHrv, "baseline", "balancedUpper"));
  const hrvBaseline = low !== null && high !== null ? { low, high } : null;

  // --- sleep ---
  const sleepByDay = new Map(sleep.map((r) => [dailyDate(r), r]));
  const sleepSeries: SleepPoint[] = [];
  for (let i = SLEEP_DAYS - 1; i >= 0; i--) {
    const date = isoDate(daysAgo(i));
    const row = sleepByDay.get(date);
    const seconds = num(pick(row, "sleepTimeSeconds"));
    const stage = (key: string) => {
      const v = num(pick(row, key));
      return v !== null ? v / 3600 : null;
    };
    sleepSeries.push({
      date,
      hours: seconds !== null && seconds > 0 ? seconds / 3600 : null,
      score: num(pick(row, "sleepScores", "overall", "value")),
      deep: stage("deepSleepSeconds"),
      light: stage("lightSleepSeconds"),
      rem: stage("remSleepSeconds"),
      awake: stage("awakeSleepSeconds"),
    });
  }

  // --- activities ---
  const activities = rawActivities
    .map(toActivity)
    .filter((a): a is ActivityRow => a !== null)
    .sort((a, b) => b.start.localeCompare(a.start));

  const kmByWeek = new Map<string, number>();
  for (let w = 0; w < WEEKS; w++) kmByWeek.set(isoDate(daysAgo(-w * 7, firstWeek)), 0);
  for (const a of activities) {
    if (!RUN_KEYS.has(a.sportKey) || a.distanceKm === null) continue;
    const [y, m, d] = a.start.slice(0, 10).split("-").map(Number);
    const week = isoDate(mondayOf(new Date(y, m - 1, d)));
    if (kmByWeek.has(week)) kmByWeek.set(week, (kmByWeek.get(week) ?? 0) + a.distanceKm);
  }

  // --- training load + time in heart-rate zones per week ---
  const trainingWeeks: TrainingWeek[] = [...kmByWeek.keys()].map((weekStart) => ({
    weekStart,
    load: 0,
    zoneMinutes: [0, 0, 0, 0, 0],
  }));
  const weekIndex = new Map(trainingWeeks.map((w) => [w.weekStart, w]));
  for (const a of activities) {
    const [y, m, d] = a.start.slice(0, 10).split("-").map(Number);
    const week = weekIndex.get(isoDate(mondayOf(new Date(y, m - 1, d))));
    if (!week) continue;
    week.load += a.trainingLoad ?? 0;
    a.zoneSeconds?.forEach((sec, z) => (week.zoneMinutes[z] += sec / 60));
  }
  for (const w of trainingWeeks) {
    w.load = Math.round(w.load);
    w.zoneMinutes = w.zoneMinutes.map((v) => Math.round(v));
  }

  // --- daily extras ---
  const stepsByDay = new Map(rawSteps.map((r) => [dailyDate(r), r]));
  const stressByDay = new Map(rawStress.map((r) => [dailyDate(r), r]));
  const dailyByDay = new Map(daily.map((r) => [dailyDate(r), r]));
  const steps: StepsPoint[] = [];
  const stress: StressPoint[] = [];
  const bodyBattery: BodyBatteryPoint[] = [];
  for (let i = VITALS_DAYS - 1; i >= 0; i--) {
    const date = isoDate(daysAgo(i));
    const s = stepsByDay.get(date);
    steps.push({ date, steps: num(pick(s, "totalSteps")), goal: num(pick(s, "stepGoal")) });
    const level = num(pick(stressByDay.get(date), "values", "overallStressLevel"));
    stress.push({ date, avg: level !== null && level > 0 ? level : null });
    const bb = dailyByDay.get(date);
    bodyBattery.push({
      date,
      min: num(pick(bb, "bodyBattery", "minValue")),
      max: num(pick(bb, "bodyBattery", "maxValue")),
    });
  }

  const weight: WeightPoint[] = rawWeight
    .map((r) => ({ date: str(pick(r, "summaryDate")), raw: num(pick(r, "latestWeight", "weight")) }))
    .filter((r): r is { date: string; raw: number } => r.date !== null && r.raw !== null)
    // Garmin reports grams
    .map((r) => ({ date: r.date, kg: Math.round((r.raw > 1000 ? r.raw / 1000 : r.raw) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const zoneRow = Array.isArray(rawZones) ? (rawZones.find((z) => pick(z, "sport") === "DEFAULT") ?? rawZones[0]) : null;
  const floors = [1, 2, 3, 4, 5].map((z) => num(pick(zoneRow, `zone${z}Floor`)));
  const zones: HrZones | null = floors.every((f) => f !== null)
    ? { floors: floors as number[], max: num(pick(zoneRow, "maxHeartRateUsed")) }
    : null;

  return {
    generatedAt: new Date().toISOString(),
    header,
    weeks: [...kmByWeek].map(([weekStart, km]) => ({ weekStart, km: Math.round(km * 10) / 10 })),
    vitals,
    hrvBaseline,
    sleep: sleepSeries,
    trainingWeeks,
    zones,
    steps,
    stress,
    bodyBattery,
    weight,
    activities,
  };
}
