"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, LINE, Tip, useReducedMotion } from "./Charts";
import {
  MUSCLES,
  MUSCLE_LABEL,
  demoStrongSets,
  e1rmTrend,
  formatForAI,
  localDay,
  muscleLoad,
  parseStrongCsv,
  recentPRs,
  setsPerDay,
  strongStats,
  topExercises,
  weeklyVolume,
  type Muscle,
  type StrongSet,
} from "@/lib/strong";
import { BODY } from "@/lib/strongBody";

const STORAGE_KEY = "strong_csv";
const HEAT_CAP = 20; // Sätze/Woche, ab hier voll gesättigt
const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
const fmtDayLong = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const weekLabel = (k: string) => {
  const [y, w] = k.split("-W");
  return `KW ${Number(w)} / ${y}`;
};

type Source = "csv" | "demo";

export function StrongSection() {
  const [sets, setSets] = useState<StrongSet[] | null>(null);
  const [source, setSource] = useState<Source>("csv");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Gespeicherte CSV wiederherstellen (läuft nur im Browser, nichts verlässt das Gerät).
  useEffect(() => {
    // Erst nach dem Hydrieren lesen (localStorage gibt es auf dem Server nicht).
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? parseStrongCsv(saved) : [];
        if (parsed.length) setSets(parsed);
      } catch {
        /* Speicher nicht verfügbar */
      }
      setReady(true);
    });
  }, []);

  const loadCsv = (csv: string) => {
    const parsed = parseStrongCsv(csv);
    if (!parsed.length) {
      setError("Keine Sätze gefunden. Ist das der CSV-Export aus Strong?");
      return;
    }
    setError("");
    setSource("csv");
    setSets(parsed);
    try {
      localStorage.setItem(STORAGE_KEY, csv);
    } catch {
      /* zu groß oder blockiert – dann eben nur für diese Sitzung */
    }
  };

  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* egal */
    }
    setSets(null);
    setError("");
  };

  if (!ready) return <div className="card pulse h-[220px]" aria-busy="true" aria-label="Kraftdaten werden geladen" />;

  if (!sets) {
    return (
      <DropCard
        error={error}
        onCsv={loadCsv}
        onDemo={() => {
          setSource("demo");
          setSets(demoStrongSets());
          setError("");
        }}
      />
    );
  }

  return <StrongContent sets={sets} sample={source === "demo"} onReset={reset} onCsv={loadCsv} />;
}

// ---------------------------------------------------------------------------

function DropCard({ error, onCsv, onDemo }: { error: string; onCsv: (csv: string) => void; onDemo: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const read = async (file?: File) => {
    if (file) onCsv(await file.text());
  };

  return (
    <div className="card flex flex-col gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void read(e.dataTransfer.files[0]);
        }}
        className={`rounded-[18px] border border-dashed px-6 py-12 text-left transition-colors ${
          over ? "border-accent bg-band" : "border-line hover:border-accent"
        }`}
      >
        <span className="t-title block">CSV hierher ziehen oder auswählen</span>
        <span className="t-small mt-1 block">In Strong: Profil → Einstellungen → Daten exportieren.</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="t-small text-accent">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-pill" onClick={onDemo}>
          Mit Beispieldaten ansehen
        </button>
        <span className="t-small">Die Datei wird nur in deinem Browser gelesen – nichts wird hochgeladen.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StrongContent({
  sets,
  sample,
  onReset,
  onCsv,
}: {
  sets: StrongSet[];
  sample: boolean;
  onReset: () => void;
  onCsv: (csv: string) => void;
}) {
  const stats = useMemo(() => strongStats(sets), [sets]);
  const swap = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {sample && <span className="chip">Beispieldaten</span>}
        <span className="chip">
          {fmtDay(localDay(stats.first))} – {fmtDay(localDay(stats.last))} {stats.last.getFullYear()}
        </span>
        <button type="button" className="btn-pill" onClick={() => swap.current?.click()}>
          Andere CSV laden
        </button>
        <button type="button" className="btn-pill" onClick={onReset}>
          {sample ? "Beispiel beenden" : "Daten entfernen"}
        </button>
        <input
          ref={swap}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onCsv(await f.text());
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Workouts" value={nf.format(stats.workouts)} caption={`${nf.format(stats.trainingDays)} Trainingstage`} />
        <Stat label="Arbeitssätze" value={nf.format(stats.workingSets)} caption="ohne Warm-ups" />
        <Stat label="Übungen" value={nf.format(stats.exercises)} caption="verschiedene" />
        <Stat label="Volumen gesamt" value={nf.format(Math.round(stats.volume / 1000))} unit="t" caption="Gewicht × Wiederholungen" />
      </div>

      <VolumeCard sets={sets} />
      <TrendCard sets={sets} />
      <ConsistencyCard sets={sets} />
      <MuscleCard sets={sets} />
      <ExportCard sets={sets} />
    </div>
  );
}

function Stat({ label, value, unit, caption }: { label: string; value: string; unit?: string; caption: string }) {
  return (
    <div className="glass flex flex-col justify-between gap-6 p-5">
      <span className="t-kicker">{label}</span>
      <div>
        <p className="text-[40px] font-extralight leading-none tracking-tight tabular-nums">
          {value}
          {unit && <span className="ml-1 text-[18px] text-fg-muted">{unit}</span>}
        </p>
        <p className="t-small mt-2">{caption}</p>
      </div>
    </div>
  );
}

function Card({ title, subtitle, right, children }: { title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h3 className="t-title">{title}</h3>
          <p className="t-small mt-1 max-w-[52ch]">{subtitle}</p>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VolumeCard({ sets }: { sets: StrongSet[] }) {
  const reduced = useReducedMotion();
  const data = useMemo(() => weeklyVolume(sets).slice(-52), [sets]);
  if (!data.length) return null;
  return (
    <Card title="Wochenvolumen" subtitle="Gewicht × Wiederholungen ohne Warm-ups, bis zu 52 Wochen. Die aktuelle Woche ist hervorgehoben.">
      <div role="img" aria-label="Wochenvolumen in Kilogramm" className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: -4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="week"
              tickFormatter={(k: string) => `KW ${Number(k.split("-W")[1])}`}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickMargin={8}
            />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              tickCount={4}
              width={52}
              tickFormatter={(v: number) => (v >= 1000 ? `${nf.format(v / 1000)} t` : `${v}`)}
            />
            <Tooltip
              cursor={{ fill: "var(--chart-band)" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                return (
                  <Tip
                    active={active}
                    title={row ? weekLabel(row.week) : ""}
                    rows={row ? [{ label: "Volumen", value: `${nf.format(row.volume)} kg` }, { label: "Sätze", value: String(row.hardSets) }] : []}
                  />
                );
              }}
            />
            <Bar dataKey="volume" radius={[8, 8, 0, 0]} maxBarSize={22} isAnimationActive={!reduced}>
              {data.map((w, i) => (
                <Cell key={w.week} fill={i === data.length - 1 ? "var(--accent)" : LINE} fillOpacity={i === data.length - 1 ? 1 : 0.82} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TrendCard({ sets }: { sets: StrongSet[] }) {
  const reduced = useReducedMotion();
  const options = useMemo(
    () => topExercises(sets, 30).filter((ex) => e1rmTrend(sets, ex).some((p) => p.e1rm > 0)),
    [sets],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const exercise = picked && options.includes(picked) ? picked : options[0];
  const trend = useMemo(() => (exercise ? e1rmTrend(sets, exercise) : []), [sets, exercise]);
  const prs = useMemo(() => recentPRs(sets, 30), [sets]);
  if (!exercise) return null;

  const first = trend[0]?.e1rm ?? 0;
  const last = trend[trend.length - 1]?.e1rm ?? 0;
  const best = Math.max(...trend.map((p) => p.e1rm));
  const delta = last - first;
  const values = trend.map((p) => p.e1rm);
  const domain: [number, number] = [Math.floor(Math.min(...values) - 3), Math.ceil(Math.max(...values) + 3)];

  return (
    <Card
      title="Kraftverlauf"
      subtitle="Geschätztes Einwiederholungsmaximum (Epley), bester Satz pro Trainingstag."
      right={
        <select
          aria-label="Übung"
          value={exercise}
          onChange={(e) => setPicked(e.target.value)}
          className="btn-pill max-w-full bg-surface-alt pr-3"
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      }
    >
      {trend.length >= 2 ? (
        <>
          <div className="mb-3 flex flex-wrap gap-x-8 gap-y-2">
            <Fact label="Aktuell" value={`${nf1.format(last)} kg`} />
            <Fact label="Bestwert" value={`${nf1.format(best)} kg`} />
            <Fact label="Seit Beginn" value={`${delta >= 0 ? "+" : "−"}${nf1.format(Math.abs(delta))} kg`} />
          </div>
          <div role="img" aria-label={`e1RM-Verlauf ${exercise}`} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} tickMargin={8} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain} tickCount={4} width={48} />
                <Tooltip
                  cursor={{ stroke: "var(--line)" }}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof trend)[number] | undefined;
                    return <Tip active={active} title={row ? fmtDayLong(row.date) : ""} rows={row ? [{ label: "e1RM", value: `${nf1.format(row.e1rm)} kg` }] : []} />;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke={LINE}
                  strokeWidth={1.8}
                  dot={trend.length <= 40 ? { r: 2.5, fill: "var(--surface-alt)", stroke: LINE, strokeWidth: 1.8 } : false}
                  activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--accent)" }}
                  isAnimationActive={!reduced}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="t-body text-fg-muted">Zu wenige Datenpunkte für diese Übung.</p>
      )}

      {prs.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="t-kicker mb-3">Neue Bestwerte · letzte 30 Tage</p>
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {prs.slice(0, 8).map((p) => (
              <li key={`${p.exercise}-${p.date}`} className="flex items-baseline justify-between gap-4 text-[15px]">
                <span className="min-w-0 truncate">{p.exercise}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {nf1.format(p.weight)} × {p.reps} · <span className="text-accent">{nf1.format(p.e1rm)} kg</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-small">{label}</p>
      <p className="text-[22px] font-light tabular-nums">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** GitHub-artige Übersicht: eine Spalte pro Woche, eine Zeile pro Wochentag. */
function ConsistencyCard({ sets }: { sets: StrongSet[] }) {
  const WEEKS = 26;
  const { cells, trained } = useMemo(() => {
    const perDay = setsPerDay(sets);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const cells: { day: string; n: number; future: boolean }[][] = [];
    let trained = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + w * 7 + d);
        const day = localDay(date);
        const n = perDay.get(day) ?? 0;
        if (n) trained++;
        col.push({ day, n, future: date > today });
      }
      cells.push(col);
    }
    return { cells, trained };
  }, [sets]);
  const max = Math.max(1, ...cells.flat().map((c) => c.n));

  return (
    <Card title="Trainingstage" subtitle={`${trained} Trainingstage in den letzten ${WEEKS} Wochen. Je dunkler, desto mehr Arbeitssätze.`}>
      <div className="no-scrollbar overflow-x-auto" role="img" aria-label="Trainingstage der letzten 26 Wochen">
        <div className="flex min-w-[520px] gap-[3px]">
          {cells.map((col, i) => (
            <div key={i} className="flex flex-1 flex-col gap-[3px]">
              {col.map((c) => (
                <div
                  key={c.day}
                  title={c.future ? undefined : `${fmtDayLong(c.day)} · ${c.n} Sätze`}
                  className="aspect-square w-full rounded-[4px]"
                  style={{
                    background: c.n
                      ? `color-mix(in oklab, var(--accent) ${Math.round(35 + (c.n / max) * 65)}%, transparent)`
                      : "var(--chart-band)",
                    opacity: c.future ? 0.35 : 1,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const PERIODS: { label: string; days: number | null }[] = [
  { label: "4 Wochen", days: 28 },
  { label: "12 Wochen", days: 84 },
  { label: "Gesamt", days: null },
];

function heat(perWeek: number) {
  const t = Math.min(perWeek / HEAT_CAP, 1);
  // Nichts → neutrale Fläche, viel → volle Akzentfarbe
  return `color-mix(in oklab, var(--chart-band) ${Math.round(100 - t * 100)}%, var(--accent))`;
}

function MuscleCard({ sets }: { sets: StrongSet[] }) {
  const [days, setDays] = useState<number | null>(84);
  const [pinned, setPinned] = useState<Muscle | null>(null);
  const [hover, setHover] = useState<Muscle | null>(null);
  const load = useMemo(() => muscleLoad(sets, days), [sets, days]);
  const order = useMemo(() => [...MUSCLES].sort((a, b) => load.muscles[b].perWeek - load.muscles[a].perWeek), [load]);
  const active = hover ?? pinned;
  const detail = active ? load.muscles[active] : null;

  return (
    <Card
      title="Muskelbelastung"
      subtitle="Gewichtete Arbeitssätze pro Woche. Ein Satz zählt voll für den Hauptmuskel und halb für unterstützende Muskeln."
      right={
        <div className="flex gap-1.5" role="group" aria-label="Zeitraum">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className="btn-pill aria-pressed:border-accent aria-pressed:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="mx-auto flex max-w-[420px] gap-2" data-active={active ? "" : undefined}>
            {(["front", "back"] as const).map((view) => (
              <figure key={view} className="m-0 flex-1">
                <figcaption className="t-small mb-1 text-center">{view === "front" ? "Vorne" : "Hinten"}</figcaption>
                <svg viewBox="0 0 200 404" aria-hidden="true" className="h-auto w-full">
                  {BODY[view].neutral.map((d, i) => (
                    <g key={i} fill="var(--chart-band)">
                      <path d={d} />
                      <path d={d} transform="translate(200 0) scale(-1 1)" />
                    </g>
                  ))}
                  {BODY[view].muscles.map(([m, ...paths]) => (
                    <g
                      key={m}
                      fill={heat(load.muscles[m].perWeek)}
                      stroke={active === m ? "var(--fg)" : "none"}
                      strokeWidth={1.5}
                      opacity={active && active !== m ? 0.35 : 1}
                      className="cursor-pointer transition-opacity"
                      onPointerEnter={() => setHover(m)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => setPinned((p) => (p === m ? null : m))}
                    >
                      {paths.map((d, i) => (
                        <path key={i} d={d} />
                      ))}
                      {paths.map((d, i) => (
                        <path key={`m${i}`} d={d} transform="translate(200 0) scale(-1 1)" />
                      ))}
                    </g>
                  ))}
                </svg>
              </figure>
            ))}
          </div>
          <div className="mx-auto mt-4 max-w-[420px]">
            <div
              className="h-2 rounded-full"
              style={{ background: "linear-gradient(90deg, var(--chart-band), var(--accent))" }}
              aria-hidden="true"
            />
            <div className="t-small mt-1 flex justify-between tabular-nums">
              <span>0</span>
              <span>10</span>
              <span>{HEAT_CAP}+ Sätze/Woche</span>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-4 min-h-[112px] rounded-2xl border border-line p-4" aria-live="polite">
            {active && detail ? (
              <>
                <p>
                  <b className="font-medium">{MUSCLE_LABEL[active]}</b>
                  <span className="t-small ml-2 tabular-nums">
                    {nf1.format(detail.perWeek)} Sätze/Woche · {nf.format(detail.sets)} gesamt
                  </span>
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-[14px]">
                  {detail.top.length ? (
                    detail.top.map((t) => (
                      <li key={t.exercise} className="flex justify-between gap-4">
                        <span className="truncate text-fg-muted">{t.exercise}</span>
                        <span className="tabular-nums">{nf1.format(t.sets)}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-fg-muted">Keine Sätze im Zeitraum</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="t-small">Muskel in der Grafik oder Liste auswählen, um die Übungen dahinter zu sehen.</p>
            )}
          </div>
          <ul className="flex flex-col">
            {order.map((m) => {
              const v = load.muscles[m].perWeek;
              return (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() => setPinned((p) => (p === m ? null : m))}
                    onPointerEnter={() => setHover(m)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(m)}
                    onBlur={() => setHover(null)}
                    aria-pressed={pinned === m}
                    className={`grid w-full grid-cols-[110px_1fr_36px] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-band ${
                      active === m ? "bg-band" : ""
                    }`}
                  >
                    <span className="truncate">{MUSCLE_LABEL[m]}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-band">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(v / HEAT_CAP, 1) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-fg-muted">{nf1.format(v)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {load.unmapped.length > 0 && <p className="t-small mt-3">Nicht zugeordnet: {load.unmapped.join(", ")}</p>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ExportCard({ sets }: { sets: StrongSet[] }) {
  const [days, setDays] = useState<number | null>(84);
  const [summary, setSummary] = useState(true);
  const [log, setLog] = useState(true);
  const [warmups, setWarmups] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const text = useMemo(() => formatForAI(sets, { days, summary, log, warmups }), [sets, days, summary, log, warmups]);

  const flash = (s: "ok" | "fail") => {
    setCopied(s);
    setTimeout(() => setCopied("idle"), 2000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flash("ok");
    } catch {
      flash("fail");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `strong-daten-${localDay(new Date())}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="Für Claude exportieren" subtitle="Kompaktes Markdown aus deinen Strong-Daten, direkt in einen Chat einfügbar.">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
        <label className="flex items-center gap-2 text-fg-muted">
          Zeitraum
          <select
            value={days ?? ""}
            onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
            className="btn-pill bg-surface-alt pr-3"
          >
            <option value="28">letzte 4 Wochen</option>
            <option value="84">letzte 12 Wochen</option>
            <option value="182">letzte 6 Monate</option>
            <option value="365">letztes Jahr</option>
            <option value="">alles</option>
          </select>
        </label>
        {(
          [
            ["Zusammenfassung", summary, setSummary],
            ["Einzelne Workouts", log, setLog],
            ["Warm-ups", warmups, setWarmups],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {label}
          </label>
        ))}
      </div>
      <textarea
        readOnly
        spellCheck={false}
        value={text}
        aria-label="Exportierter Text"
        className="h-[240px] w-full resize-y rounded-2xl border border-line bg-transparent p-4 font-mono text-[12.5px] leading-relaxed text-fg-muted focus-visible:border-accent focus-visible:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-pill" onClick={copy}>
          {copied === "ok" ? "Kopiert ✓" : copied === "fail" ? "Kopieren nicht möglich" : "Für Claude kopieren"}
        </button>
        <button type="button" className="btn-pill" onClick={download}>
          Als .md speichern
        </button>
        <span className="t-small ml-auto tabular-nums">
          {nf.format(text.length)} Zeichen · ca. {nf.format(text.length / 3.5)} Tokens
        </span>
      </div>
    </Card>
  );
}
