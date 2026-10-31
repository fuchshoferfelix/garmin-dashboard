// lib/strong.ts – Parser + Auswertungen für den Strong-CSV-Export (Quelle: "strong parser/")
// Export in der App: Profil → Einstellungen → "Daten exportieren" → CSV

export type StrongSet = {
  date: Date;
  workout: string;
  exercise: string;
  setOrder: string; // "1", "2", … oder "W" (Warm-up), "D" (Drop-Set), "F" (Failure)
  weight: number;   // in der Einheit, die du in Strong eingestellt hast (kg)
  reps: number;
  rpe: number | null;
};

// Strong exportiert je nach Version mit ";" oder "," – beides wird unterstützt
function detectDelimiter(headerLine: string): string {
  return (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

// Minimaler CSV-Splitter, der Anführungszeichen beachtet (Notizen können Kommas enthalten)
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseStrongCsv(csv: string): StrongSet[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = detectDelimiter(lines[0]);
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());
  // Spaltennamen je nach App-Sprache (EN / DE)
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));

  const iDate = col("date", "datum"), iWorkout = col("workout name", "workout-name");
  const iEx = col("exercise name", "name der übung");
  const iSet = col("set order", "reihenfolge festlegen"), iW = col("weight", "gewicht");
  const iReps = col("reps", "wiederh."), iRpe = col("rpe");

  if (iDate < 0 || iEx < 0) return [];

  const num = (s?: string) => {
    const n = parseFloat((s ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  return lines.slice(1).map((line) => {
    const c = splitLine(line, delim);
    return {
      date: new Date((c[iDate] ?? "").replace(" ", "T")),
      workout: c[iWorkout] ?? "",
      exercise: c[iEx] ?? "",
      setOrder: c[iSet] ?? "",
      weight: num(c[iW]),
      reps: num(c[iReps]),
      rpe: iRpe >= 0 && c[iRpe] ? num(c[iRpe]) : null,
    };
  }).filter((s) => s.exercise && !isNaN(s.date.getTime()));
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Lokaler Kalendertag "YYYY-MM-DD" (nicht UTC, sonst rutschen späte Workouts auf den Folgetag). */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isWorkingSet = (s: StrongSet) => s.setOrder !== "W" && s.reps > 0;

// Epley-Formel: geschätztes 1RM
export const e1rm = (weight: number, reps: number) =>
  reps === 1 ? weight : weight * (1 + reps / 30);

// ISO-Wochenschlüssel, z. B. "2026-W44"
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// 1) Wochenvolumen (Gewicht × Wdh., ohne Warm-ups) + Anzahl harter Sätze
export function weeklyVolume(sets: StrongSet[]) {
  const map = new Map<string, { week: string; volume: number; hardSets: number }>();
  for (const s of sets.filter(isWorkingSet)) {
    const k = weekKey(s.date);
    const e = map.get(k) ?? { week: k, volume: 0, hardSets: 0 };
    e.volume += s.weight * s.reps;
    e.hardSets += 1;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}

// 2) e1RM-Verlauf pro Übung (bester Satz pro Trainingstag)
export function e1rmTrend(sets: StrongSet[], exercise: string) {
  const map = new Map<string, number>();
  for (const s of sets.filter((x) => x.exercise === exercise && isWorkingSet(x))) {
    const day = localDay(s.date);
    map.set(day, Math.max(map.get(day) ?? 0, e1rm(s.weight, s.reps)));
  }
  return [...map.entries()]
    .map(([date, value]) => ({ date, e1rm: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 3) Top-Übungen nach Häufigkeit (für Dropdown/Auswahl)
export function topExercises(sets: StrongSet[], limit = 8) {
  const count = new Map<string, number>();
  for (const s of sets.filter(isWorkingSet)) count.set(s.exercise, (count.get(s.exercise) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

// 4) Neue PRs (e1RM) in den letzten X Tagen
export function recentPRs(sets: StrongSet[], days = 30) {
  const cutoff = Date.now() - days * 86400000;
  const best = new Map<string, number>();
  const prs: { exercise: string; date: string; weight: number; reps: number; e1rm: number }[] = [];
  for (const s of [...sets].filter(isWorkingSet).sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const v = e1rm(s.weight, s.reps);
    if (v > (best.get(s.exercise) ?? 0)) {
      best.set(s.exercise, v);
      if (s.date.getTime() >= cutoff)
        prs.push({ exercise: s.exercise, date: localDay(s.date), weight: s.weight, reps: s.reps, e1rm: Math.round(v * 10) / 10 });
    }
  }
  return prs.reverse();
}

// ---------------------------------------------------------------------------
// Export für KI (Claude): kompaktes Markdown mit Zusammenfassung + Workout-Log
// ---------------------------------------------------------------------------

export type ExportOptions = {
  days: number | null; // Zeitraum ab dem letzten Workout, null = alles
  summary: boolean;    // Wochenvolumen, Top-Übungen, PRs
  log: boolean;        // jedes Workout einzeln
  warmups: boolean;
};

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function formatForAI(all: StrongSet[], o: ExportOptions): string {
  if (!all.length) return "";
  const last = Math.max(...all.map((s) => s.date.getTime()));
  const cutoff = o.days == null ? -Infinity : last - o.days * 86400000;
  const sets = all
    .filter((s) => s.date.getTime() >= cutoff && (o.warmups || s.setOrder !== "W"))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!sets.length) return "";

  const workouts = new Map<string, StrongSet[]>();
  for (const s of sets) {
    const k = `${s.date.getTime()}|${s.workout}`;
    workouts.set(k, [...(workouts.get(k) ?? []), s]);
  }

  const out: string[] = [];
  out.push("# Strong Trainingsdaten");
  out.push(
    `Zeitraum: ${localDay(sets[0].date)} bis ${localDay(sets[sets.length - 1].date)} · ` +
    `${workouts.size} Workouts · ${sets.length} Sätze · Einheit: kg`
  );
  out.push("Satzformat: Gewicht x Wdh [@RPE]. W = Warm-up, D = Drop-Set, F = Failure, BW = Körpergewicht/0 kg. e1RM nach Epley.");

  if (o.summary) {
    const working = sets.filter(isWorkingSet);
    out.push("", "## Wochenvolumen (ohne Warm-ups, Gewicht × Wdh.)");
    for (const w of weeklyVolume(working).slice(-52))
      out.push(`- ${w.week}: ${Math.round(w.volume)} kg, ${w.hardSets} Sätze`);

    out.push("", "## Top-Übungen (e1RM-Entwicklung)");
    for (const ex of topExercises(working, 8)) {
      const t = e1rmTrend(working, ex);
      if (!t.length) continue;
      const best = Math.max(...t.map((p) => p.e1rm));
      const recent = t.slice(-8).map((p) => `${p.date.slice(5)}: ${p.e1rm}`).join(", ");
      out.push(`- ${ex} — ${t.length} Einheiten, erster e1RM ${t[0].e1rm}, Bestwert ${best}, zuletzt: ${recent}`);
    }

    const prs = recentPRs(all, 30);
    if (prs.length) {
      out.push("", "## Neue PRs (letzte 30 Tage)");
      for (const p of prs) out.push(`- ${p.date} ${p.exercise}: ${fmt(p.weight)} x ${p.reps} (e1RM ${p.e1rm})`);
    }
  }

  if (o.log) {
    out.push("", "## Workouts");
    for (const group of [...workouts.values()].reverse()) {
      out.push("", `### ${localDay(group[0].date)} ${group[0].workout}`);
      const byEx = new Map<string, StrongSet[]>();
      for (const s of group) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s]);
      for (const [ex, list] of byEx) {
        const txt = list
          .map((s) => {
            const prefix = /^[WDF]$/.test(s.setOrder) ? `${s.setOrder} ` : "";
            return `${prefix}${s.weight ? fmt(s.weight) : "BW"}x${fmt(s.reps)}${s.rpe != null ? `@${fmt(s.rpe)}` : ""}`;
          })
          .join(", ");
        out.push(`- ${ex}: ${txt}`);
      }
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Muskelbelastung: Übung → Muskelgruppen (Haupt = 1 Satz, Hilfs = 0,5 Satz)
// ---------------------------------------------------------------------------

export const MUSCLES = [
  "chest", "shoulders", "rearDelts", "traps", "lats", "lowerBack",
  "biceps", "triceps", "forearms", "abs", "obliques",
  "glutes", "quads", "hamstrings", "adductors", "calves",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Brust", shoulders: "Schultern", rearDelts: "Hintere Schulter", traps: "Trapez",
  lats: "Latissimus", lowerBack: "Unterer Rücken", biceps: "Bizeps", triceps: "Trizeps",
  forearms: "Unterarme", abs: "Bauch", obliques: "Seitlicher Bauch", glutes: "Gesäß",
  quads: "Quadrizeps", hamstrings: "Beinbeuger", adductors: "Adduktoren", calves: "Waden",
};

// Erste passende Regel gewinnt – die Reihenfolge ist wichtig (z. B. "leg curl" vor "curl").
const RULES: [RegExp, Muscle[], Muscle[]][] = [
  [/abductor|abduction/, ["glutes"], []],
  [/crunch|sit.?up|leg raise|knee raise|plank|ab wheel/, ["abs"], ["obliques"]],
  [/twist|woodchop|side bend/, ["obliques"], ["abs"]],
  [/calf/, ["calves"], []],
  [/leg extension/, ["quads"], []],
  [/leg curl|hamstring/, ["hamstrings"], ["calves"]],
  [/romanian|stiff.?leg|good morning/, ["hamstrings", "glutes"], ["lowerBack"]],
  [/deadlift/, ["glutes", "hamstrings", "lowerBack"], ["traps", "quads"]],
  [/hip thrust|glute|bridge/, ["glutes"], ["hamstrings"]],
  [/squat|hack|leg press|lunge/, ["quads", "glutes"], ["adductors", "hamstrings"]],
  [/lateral raise|upright row/, ["shoulders"], ["traps"]],
  [/reverse fly|rear delt|face pull/, ["rearDelts"], ["traps"]],
  [/shoulder press|overhead press|military|arnold/, ["shoulders"], ["triceps"]],
  [/front raise/, ["shoulders"], ["chest"]],
  [/shrug/, ["traps"], ["forearms"]],
  [/skull|tricep|pushdown|kickback|close.?grip bench/, ["triceps"], []],
  [/wrist curl|forearm/, ["forearms"], []],
  [/curl/, ["biceps"], ["forearms"]],
  [/pull.?up|chin.?up|pulldown/, ["lats"], ["biceps", "rearDelts"]],
  [/pullover/, ["lats"], ["chest", "triceps"]],
  [/row/, ["lats", "traps"], ["biceps", "rearDelts", "lowerBack"]],
  [/dip/, ["chest", "triceps"], ["shoulders"]],
  [/fly|pec deck|crossover/, ["chest"], ["shoulders"]],
  [/bench|chest press|push.?up|press/, ["chest"], ["triceps", "shoulders"]],
  [/back extension|hyperextension/, ["lowerBack"], ["glutes", "hamstrings"]],
];

export function musclesFor(exercise: string): { primary: Muscle[]; secondary: Muscle[] } | null {
  const name = exercise.toLowerCase();
  for (const [re, primary, secondary] of RULES) if (re.test(name)) return { primary, secondary };
  return null;
}

export type MuscleLoad = {
  weeks: number;
  muscles: Record<Muscle, { sets: number; perWeek: number; top: { exercise: string; sets: number }[] }>;
  unmapped: string[];
};

// days = null → gesamter Zeitraum. Das Fenster endet beim letzten Workout (wie beim KI-Export).
export function muscleLoad(all: StrongSet[], days: number | null): MuscleLoad {
  if (!all.length) {
    const muscles = Object.fromEntries(MUSCLES.map((m) => [m, { sets: 0, perWeek: 0, top: [] }])) as unknown as MuscleLoad["muscles"];
    return { weeks: 1, muscles, unmapped: [] };
  }
  const working = all.filter(isWorkingSet);
  const last = Math.max(...all.map((s) => s.date.getTime()));
  const first = Math.min(...all.map((s) => s.date.getTime()));
  const cutoff = days == null ? -Infinity : last - days * 86400000;
  const spanWeeks = (last - first) / (7 * 86400000);
  const weeks = Math.max(1, days == null ? spanWeeks : Math.min(days / 7, spanWeeks));

  const acc = Object.fromEntries(MUSCLES.map((m) => [m, new Map<string, number>()])) as Record<Muscle, Map<string, number>>;
  const unmapped = new Set<string>();
  for (const s of working) {
    if (s.date.getTime() < cutoff) continue;
    const hit = musclesFor(s.exercise);
    if (!hit) { unmapped.add(s.exercise); continue; }
    for (const m of hit.primary) acc[m].set(s.exercise, (acc[m].get(s.exercise) ?? 0) + 1);
    for (const m of hit.secondary) acc[m].set(s.exercise, (acc[m].get(s.exercise) ?? 0) + 0.5);
  }
  const muscles = Object.fromEntries(MUSCLES.map((m) => {
    const entries = [...acc[m].entries()].sort((a, b) => b[1] - a[1]);
    const sets = entries.reduce((n, [, v]) => n + v, 0);
    return [m, { sets, perWeek: sets / weeks, top: entries.slice(0, 4).map(([exercise, sets]) => ({ exercise, sets })) }];
  })) as MuscleLoad["muscles"];
  return { weeks, muscles, unmapped: [...unmapped] };
}

// ---------------------------------------------------------------------------
// Zusätzliche Auswertungen fürs Dashboard
// ---------------------------------------------------------------------------

/** Arbeitssätze pro lokalem Kalendertag – Grundlage für die Trainingstage-Übersicht. */
export function setsPerDay(sets: StrongSet[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sets) if (isWorkingSet(s)) map.set(localDay(s.date), (map.get(localDay(s.date)) ?? 0) + 1);
  return map;
}

export function strongStats(sets: StrongSet[]) {
  const working = sets.filter(isWorkingSet);
  const days = new Set(sets.map((s) => localDay(s.date)));
  const times = sets.map((s) => s.date.getTime());
  return {
    workouts: new Set(sets.map((s) => `${s.date.getTime()}|${s.workout}`)).size,
    trainingDays: days.size,
    workingSets: working.length,
    exercises: new Set(working.map((s) => s.exercise)).size,
    volume: working.reduce((n, s) => n + s.weight * s.reps, 0),
    first: new Date(Math.min(...times)),
    last: new Date(Math.max(...times)),
  };
}

// ---------------------------------------------------------------------------
// Beispieldaten (deterministisch), damit das Feature ohne eigene CSV erlebbar ist
// ---------------------------------------------------------------------------

export function demoStrongSets(weeks = 20): StrongSet[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  type Ex = [name: string, start: number, step: number, reps: [number, number], sets: number];
  const plan: Record<string, Ex[]> = {
    Push: [
      ["Bench Press (Barbell)", 70, 1.25, [5, 8], 4],
      ["Overhead Press (Barbell)", 42.5, 0.75, [6, 9], 3],
      ["Incline Bench Press (Dumbbell)", 26, 0.5, [8, 12], 3],
      ["Lateral Raise (Dumbbell)", 10, 0.25, [10, 15], 4],
      ["Triceps Pushdown (Cable)", 30, 0.5, [10, 14], 3],
    ],
    Pull: [
      ["Deadlift (Barbell)", 110, 2.5, [3, 6], 3],
      ["Pull Up", 0, 0, [6, 10], 4],
      ["Bent Over Row (Barbell)", 65, 1, [6, 10], 3],
      ["Face Pull (Cable)", 25, 0.5, [12, 15], 3],
      ["Bicep Curl (Dumbbell)", 14, 0.25, [8, 12], 3],
    ],
    Legs: [
      ["Squat (Barbell)", 90, 1.5, [5, 8], 4],
      ["Romanian Deadlift (Barbell)", 80, 1.5, [8, 10], 3],
      ["Leg Press", 160, 4, [8, 12], 3],
      ["Leg Curl (Machine)", 40, 1, [10, 14], 3],
      ["Standing Calf Raise", 60, 1.5, [12, 16], 4],
    ],
  };
  const order = ["Push", "Pull", "Legs"];
  const start = new Date();
  start.setHours(18, 15, 0, 0);
  start.setDate(start.getDate() - weeks * 7);
  const out: StrongSet[] = [];
  let session = 0;
  for (let day = 0; day < weeks * 7; day++) {
    const d = new Date(start);
    d.setDate(start.getDate() + day);
    const dow = (d.getDay() + 6) % 7; // Mo = 0
    if (![0, 2, 4, 5].includes(dow) || rnd() < 0.08) continue; // Mo, Mi, Fr, Sa – gelegentlich ausgelassen
    const name = order[session++ % 3];
    const progress = day / 7;
    for (const [exercise, w0, step, [rLo, rHi], n] of plan[name]) {
      const base = Math.round((w0 + step * progress) * 2) / 2;
      if (base > 20) out.push({ date: d, workout: name, exercise, setOrder: "W", weight: Math.round(base * 0.55 / 2.5) * 2.5, reps: 8, rpe: null });
      for (let i = 0; i < n; i++) {
        const reps = Math.max(rLo - 1, Math.round(rHi - i * 0.9 - rnd() * 1.5));
        out.push({ date: d, workout: name, exercise, setOrder: String(i + 1), weight: base, reps, rpe: rnd() < 0.5 ? Math.min(10, 7 + i * 0.5 + (rnd() < 0.5 ? 0.5 : 0)) : null });
      }
    }
  }
  return out;
}
