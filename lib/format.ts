const SPORTS: Record<string, string> = {
  running: "Laufen",
  trail_running: "Trailrun",
  treadmill_running: "Laufband",
  track_running: "Bahnlauf",
  virtual_run: "Virtueller Lauf",
  walking: "Gehen",
  hiking: "Wandern",
  cycling: "Radfahren",
  road_biking: "Rennrad",
  mountain_biking: "Mountainbike",
  gravel_cycling: "Gravel",
  indoor_cycling: "Indoor-Rad",
  virtual_ride: "Virtuelle Fahrt",
  lap_swimming: "Schwimmen",
  open_water_swimming: "Freiwasser",
  strength_training: "Krafttraining",
  yoga: "Yoga",
  pilates: "Pilates",
  elliptical: "Crosstrainer",
  indoor_cardio: "Cardio",
  hiit: "HIIT",
  rowing: "Rudern",
  indoor_rowing: "Rudergerät",
  stand_up_paddleboarding: "SUP",
  resort_skiing_snowboarding: "Ski & Snowboard",
  other: "Sonstiges",
};

export function sportLabel(key: string): string {
  if (SPORTS[key]) return SPORTS[key];
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const isRunLike = (key: string) => /running|run$|walking|hiking/.test(key);

function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const dayShort = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "numeric" });
const dayLong = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short" });

export const fmtDayShort = (iso: string) => dayShort.format(parseDay(iso));
export const fmtDayLong = (iso: string) => dayLong.format(parseDay(iso));

export function relativeDay(iso: string, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - parseDay(iso).getTime()) / 86_400_000);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  return `vor ${diff} Tagen`;
}

export function fmtDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} h`;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

export function fmtPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} min/km`;
}

export const fmtKm = (km: number) => `${km.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;

export const fmtHours = (h: number) => {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
};
