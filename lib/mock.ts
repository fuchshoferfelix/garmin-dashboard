import type { ActivityDetail, ActivityRow, DashboardData, DetailPoint, Heatmap, LatLon } from "./types";

// Deterministic sample data in the same shape as the real dashboard payload.

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() - n);
}

/** Small wave-based pseudo-noise so charts look natural but stay stable per render. */
function wave(i: number, seed: number): number {
  return Math.sin(i * 1.7 + seed) * 0.6 + Math.sin(i * 0.53 + seed * 2) * 0.4;
}

export function mockDashboard(): DashboardData {
  const today = new Date();
  const monday = daysAgo((today.getDay() + 6) % 7);
  const weeklyKm = [18, 24, 27, 22, 30, 34, 28, 20, 32, 38, 35, 26, 40, 42, 36, 21];

  const vitals = Array.from({ length: 60 }, (_, k) => {
    const i = 59 - k;
    return {
      date: iso(daysAgo(i)),
      hrv: Math.round(64 + wave(k, 1) * 9),
      restingHr: Math.round(52 + wave(k, 4) * 3),
    };
  });

  const sleep = Array.from({ length: 28 }, (_, k) => {
    const hours = 7.2 + wave(k, 2) * 0.9;
    const deep = 1.2 + wave(k, 3) * 0.3;
    const rem = 1.7 + wave(k, 6) * 0.35;
    const awake = 0.4 + wave(k, 7) * 0.15;
    return {
      date: iso(daysAgo(27 - k)),
      hours: Math.round(hours * 10) / 10,
      score: Math.round(78 + wave(k, 5) * 9),
      deep,
      rem,
      awake,
      light: hours - deep - rem,
    };
  });

  const sample: [string, string, number | null, number, number | null, number | null][] = [
    ["running", "Lockerer Lauf", 8.4, 2640, null, 142],
    ["strength_training", "Kraft", null, 2700, null, 112],
    ["running", "Intervalle", 10.2, 3060, null, 158],
    ["cycling", "Ausfahrt", 42.6, 5880, 168, 131],
    ["running", "Langer Lauf", 18.1, 6240, null, 147],
    ["walking", "Spaziergang", 4.2, 3000, null, 98],
    ["running", "Lockerer Lauf", 7.5, 2400, null, 140],
    ["yoga", "Mobility", null, 1800, null, 86],
    ["running", "Tempolauf", 9.3, 2640, null, 163],
    ["cycling", "Grundlage", 35.0, 4800, 152, 128],
  ];
  const activities: ActivityRow[] = sample.map(([sportKey, name, km, durationS, powerW, avgHr], i) => ({
    id: i + 1,
    sportKey,
    name,
    start: `${iso(daysAgo(i * 2 + 1))} 07:30:00`,
    distanceKm: km,
    durationS,
    paceSecPerKm: km && sportKey.includes("running") ? durationS / km : null,
    powerW,
    speedKmh: km && !sportKey.includes("running") ? (km / durationS) * 3600 : null,
    avgHr,
    elevationGain: km ? Math.round(km * 9) : null,
    trainingLoad: Math.round(durationS / 30),
    cadence: sportKey.includes("running") ? 168 : null,
    zoneSeconds: null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    header: {
      restingHr: { value: 52, date: iso(today) },
      hrv: { value: 66, date: iso(today) },
      sleepScore: { value: 81, date: iso(today) },
      bodyBattery: { value: 74, date: iso(today) },
    },
    weeks: weeklyKm.map((km, w) => ({ weekStart: iso(daysAgo((weeklyKm.length - 1 - w) * 7, monday)), km })),
    vitals,
    hrvBaseline: { low: 58, high: 74 },
    sleep,
    trainingWeeks: weeklyKm.map((km, w) => ({
      weekStart: iso(daysAgo((weeklyKm.length - 1 - w) * 7, monday)),
      load: Math.round(km * 9 + wave(w, 3) * 30),
      zoneMinutes: [0.35, 0.3, 0.2, 0.1, 0.05].map((share) => Math.round(km * 6.2 * share)),
    })),
    zones: { floors: [100, 120, 140, 160, 175], max: 190 },
    steps: Array.from({ length: 60 }, (_, k) => ({
      date: iso(daysAgo(59 - k)),
      steps: Math.round(9200 + wave(k, 6) * 3600),
      goal: 10000,
    })),
    stress: Array.from({ length: 60 }, (_, k) => ({ date: iso(daysAgo(59 - k)), avg: Math.round(31 + wave(k, 7) * 8) })),
    bodyBattery: Array.from({ length: 60 }, (_, k) => ({
      date: iso(daysAgo(59 - k)),
      min: Math.round(22 + wave(k, 8) * 8),
      max: Math.round(88 + wave(k, 9) * 8),
    })),
    weight: Array.from({ length: 10 }, (_, k) => ({ date: iso(daysAgo(81 - k * 9)), kg: Math.round((74.2 + wave(k, 1) * 0.8) * 10) / 10 })),
    activities,
  };
}

// ---- sample GPS data ------------------------------------------------------

const HOME: LatLon = [48.1486, 11.5905];

/** A deformed closed loop of roughly `km` kilometres starting at HOME. */
function mockLoop(seed: number, km: number, points = 160): LatLon[] {
  const r = km / 6.54;
  const spin = seed * 0.9;
  const kmLon = 111 * Math.cos((HOME[0] * Math.PI) / 180);
  return Array.from({ length: points + 1 }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const bump = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2);
    const x = Math.cos(a) * r * 1.3 * bump - r * 1.3;
    const y = Math.sin(a) * r * 0.7 * bump;
    const rx = x * Math.cos(spin) - y * Math.sin(spin);
    const ry = x * Math.sin(spin) + y * Math.cos(spin);
    return [HOME[0] + ry / 111, HOME[1] + rx / kmLon] as LatLon;
  });
}

export function mockHeatmap(): Heatmap {
  const routes = Array.from({ length: 48 }, (_, i) => mockLoop(i % 7, 5 + ((i * 7) % 14)));
  return { routes, runs: routes.length, km: 412.6, months: 12 };
}

export function mockActivityDetail(row: ActivityRow): ActivityDetail {
  if (row.distanceKm === null || row.sportKey === "strength_training" || row.sportKey === "yoga") {
    return { id: row.id, track: [], points: [] };
  }
  const track = mockLoop(row.id, row.distanceKm);
  const n = 240;
  const baseKmh = row.speedKmh ?? (row.paceSecPerKm ? 3600 / row.paceSecPerKm : 10);
  const points: DetailPoint[] = Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    const pos = track[Math.round(f * (track.length - 1))];
    const kmh = baseKmh * (1 + wave(i, row.id) * 0.1);
    return {
      km: f * row.distanceKm!,
      t: f * row.durationS,
      lat: pos[0],
      lon: pos[1],
      ele: 520 + Math.sin(f * Math.PI * 2) * 18 + wave(i, 3) * 3,
      hr: Math.round((row.avgHr ?? 140) + wave(i, 5) * 8 + f * 6),
      kmh,
      cadence: row.cadence !== null ? Math.round(row.cadence + wave(i, 2) * 4) : null,
    };
  });
  return { id: row.id, track, points };
}
