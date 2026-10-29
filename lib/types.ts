// Shared between server (lib/dashboard.ts) and client components. No secrets here.

export type HeaderMetric = { value: number; date: string } | null;

export type WeekVolume = { weekStart: string; km: number };

export type VitalsPoint = { date: string; hrv: number | null; restingHr: number | null };

export type SleepPoint = {
  date: string;
  hours: number | null;
  score: number | null;
  /** Hours per sleep stage; null when Garmin reports no stage breakdown */
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
};

export type ActivityRow = {
  id: number;
  sportKey: string;
  name: string;
  /** Local start time, "YYYY-MM-DD HH:mm:ss" */
  start: string;
  distanceKm: number | null;
  durationS: number;
  paceSecPerKm: number | null;
  powerW: number | null;
  speedKmh: number | null;
  avgHr: number | null;
  elevationGain: number | null;
  trainingLoad: number | null;
  cadence: number | null;
  /** Seconds in heart-rate zones 1–5 */
  zoneSeconds: number[] | null;
};

export type TrainingWeek = { weekStart: string; load: number; zoneMinutes: number[] };

export type StepsPoint = { date: string; steps: number | null; goal: number | null };

export type StressPoint = { date: string; avg: number | null };

export type BodyBatteryPoint = { date: string; min: number | null; max: number | null };

export type WeightPoint = { date: string; kg: number };

export type HrZones = { floors: number[]; max: number | null };

export type DashboardData = {
  generatedAt: string;
  header: {
    restingHr: HeaderMetric;
    hrv: HeaderMetric;
    sleepScore: HeaderMetric;
    bodyBattery: HeaderMetric;
  };
  weeks: WeekVolume[];
  vitals: VitalsPoint[];
  hrvBaseline: { low: number; high: number } | null;
  sleep: SleepPoint[];
  trainingWeeks: TrainingWeek[];
  zones: HrZones | null;
  steps: StepsPoint[];
  stress: StressPoint[];
  bodyBattery: BodyBatteryPoint[];
  weight: WeightPoint[];
  activities: ActivityRow[];
};

export type LatLon = [number, number];

/** One sample of an activity (downsampled by Garmin), distance-ordered. */
export type DetailPoint = {
  km: number;
  /** Elapsed seconds */
  t: number;
  lat: number | null;
  lon: number | null;
  ele: number | null;
  hr: number | null;
  kmh: number | null;
  cadence: number | null;
};

export type ActivityDetail = {
  id: number;
  /** GPS track, empty for indoor activities */
  track: LatLon[];
  points: DetailPoint[];
};

export type Heatmap = {
  routes: LatLon[][];
  runs: number;
  km: number;
  /** Number of months the heatmap covers */
  months: number;
};

export type ApiError = { error: string; code: "auth" | "upstream" };
