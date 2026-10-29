import { fmtDuration, fmtPace, sportLabel } from "./format";
import type { DashboardData } from "./types";

type Cell = string | number | null | undefined;

const dash = "–";

function cell(v: Cell, decimals = 0): string {
  if (v === null || v === undefined) return dash;
  if (typeof v === "string") return v.replace(/\|/g, "/");
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}

function table(headers: string[], rows: Cell[][]): string {
  if (rows.length === 0) return "_Keine Daten im Zeitraum._\n";
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map((c) => (typeof c === "string" ? cell(c) : String(c ?? dash))).join(" | ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? dash : v.toFixed(d));

function avg(values: (number | null)[]): number | null {
  const vals = values.filter((v): v is number => v !== null);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Day-by-day merge of every daily series, newest day last. */
function dailyRows(data: DashboardData): string[][] {
  const days = new Map<string, Record<string, number | null>>();
  const put = (date: string, key: string, value: number | null) => {
    const row = days.get(date) ?? {};
    row[key] = value;
    days.set(date, row);
  };
  for (const v of data.vitals) {
    put(v.date, "hrv", v.hrv);
    put(v.date, "rhr", v.restingHr);
  }
  for (const s of data.sleep) {
    put(s.date, "sleepH", s.hours);
    put(s.date, "sleepScore", s.score);
    put(s.date, "deep", s.deep);
    put(s.date, "rem", s.rem);
  }
  for (const b of data.bodyBattery) {
    put(b.date, "bbMin", b.min);
    put(b.date, "bbMax", b.max);
  }
  for (const s of data.stress) put(s.date, "stress", s.avg);
  for (const s of data.steps) put(s.date, "steps", s.steps);
  for (const w of data.weight) put(w.date, "kg", w.kg);

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, r]) => [
      date,
      n(r.hrv),
      n(r.rhr),
      n(r.sleepH, 1),
      n(r.sleepScore),
      n(r.deep, 1),
      n(r.rem, 1),
      n(r.bbMin),
      n(r.bbMax),
      n(r.stress),
      n(r.steps),
      n(r.kg, 1),
    ]);
}

/** Plain-Markdown snapshot of the dashboard, meant to be pasted into a chat for analysis. */
export function dashboardToMarkdown(data: DashboardData, sample = false): string {
  const out: string[] = [];
  const h = data.header;
  const hm = (m: { value: number; date: string } | null) => (m ? `${Math.round(m.value)} (${m.date})` : dash);

  out.push("# Garmin-Trainingsdaten");
  out.push(
    `Stand: ${data.generatedAt.slice(0, 16).replace("T", " ")}${sample ? " · ACHTUNG: Beispieldaten, keine echten Werte" : ""}\n`,
  );
  out.push(
    "Bitte analysiere diese Daten: Trends bei Belastung, Erholung (HRV, Ruhepuls, Schlaf) und Training, " +
      "Auffälligkeiten und konkrete Empfehlungen. Fehlende Werte sind mit „–“ markiert.\n",
  );

  out.push("## Aktuelle Werte");
  out.push(`- Ruhepuls (bpm): ${hm(h.restingHr)}`);
  out.push(`- HRV (ms): ${hm(h.hrv)}${data.hrvBaseline ? ` · Referenzbereich ${data.hrvBaseline.low}–${data.hrvBaseline.high} ms` : ""}`);
  out.push(`- Schlaf-Score: ${hm(h.sleepScore)}`);
  out.push(`- Body Battery (Tagesmax, %): ${hm(h.bodyBattery)}`);
  if (data.zones) {
    out.push(
      `- Herzfrequenz-Zonen (Untergrenzen, bpm): ${data.zones.floors.map((f, i) => `Z${i + 1} ab ${f}`).join(", ")}${data.zones.max ? ` · Max ${data.zones.max}` : ""}`,
    );
  }
  out.push("");

  out.push(`## Wochen (${data.weeks.length} Wochen, Start = Montag)`);
  const loadByWeek = new Map(data.trainingWeeks.map((w) => [w.weekStart, w]));
  out.push(
    table(
      ["Woche", "Lauf-km", "Belastung", "Z1 min", "Z2 min", "Z3 min", "Z4 min", "Z5 min"],
      data.weeks.map((w) => {
        const t = loadByWeek.get(w.weekStart);
        return [w.weekStart, n(w.km, 1), n(t?.load), ...[0, 1, 2, 3, 4].map((i) => n(t?.zoneMinutes[i]))];
      }),
    ),
  );

  out.push(`## Aktivitäten (${data.activities.length})`);
  const sorted = [...data.activities].sort((a, b) => a.start.localeCompare(b.start));
  out.push(
    table(
      ["Datum", "Sportart", "Name", "km", "Dauer", "Pace", "Ø Puls", "Höhenmeter", "Belastung", "Kadenz", "Leistung W"],
      sorted.map((a) => [
        a.start.slice(0, 16),
        sportLabel(a.sportKey),
        a.name,
        n(a.distanceKm, 2),
        fmtDuration(a.durationS),
        a.paceSecPerKm ? fmtPace(a.paceSecPerKm).replace(" min/km", "") : dash,
        n(a.avgHr),
        n(a.elevationGain),
        n(a.trainingLoad),
        n(a.cadence),
        n(a.powerW),
      ]),
    ),
  );

  out.push("## Tageswerte (neueste zuletzt)");
  out.push(
    "Spalten: HRV in ms, Ruhepuls in bpm, Schlaf in h, Tiefschlaf/REM in h, Body Battery Min/Max in %, Stress Ø, Schritte, Gewicht in kg.\n",
  );
  out.push(
    table(
      ["Datum", "HRV", "Ruhepuls", "Schlaf h", "Schlaf-Score", "Tief h", "REM h", "BB min", "BB max", "Stress", "Schritte", "kg"],
      dailyRows(data),
    ),
  );

  const sleepAvg = avg(data.sleep.map((s) => s.hours));
  const hrvAvg = avg(data.vitals.map((v) => v.hrv));
  const rhrAvg = avg(data.vitals.map((v) => v.restingHr));
  out.push("## Durchschnitte im Zeitraum");
  out.push(`- Schlaf: ${n(sleepAvg, 1)} h · HRV: ${n(hrvAvg)} ms · Ruhepuls: ${n(rhrAvg)} bpm`);
  out.push(`- Lauf-km gesamt: ${n(data.weeks.reduce((s, w) => s + w.km, 0), 1)} km`);

  return `${out.join("\n")}\n`;
}
