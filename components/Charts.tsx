"use client";

import { useSyncExternalStore, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDayLong, fmtDayShort, fmtHours, fmtKm } from "@/lib/format";
import type {
  BodyBatteryPoint,
  StepsPoint,
  TrainingWeek,
  SleepPoint,
  VitalsPoint,
  WeekVolume,
} from "@/lib/types";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => true,
  );
}

export const AXIS = { fill: "var(--fg-muted)", fontSize: 12, fontWeight: 400 } as const;
export const LINE = "var(--chart-line)";

type TipRow = { label: string; value: string };

export function Tip({ active, title, rows }: { active?: boolean; title: string; rows: TipRow[] }) {
  if (!active || rows.length === 0) return null;
  return (
    <div
      className="rounded-2xl border border-line bg-surface-raised px-4 py-3 shadow-float"
      style={{ minWidth: 140 }}
    >
      <div className="t-small mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 text-[13px] font-normal text-fg">
          <span className="text-fg-muted">{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Older points hollow, the newest filled. Skips gaps. */
function dotRenderer(lastIndex: number, valueKey: string) {
  const Dot = (props: {
    cx?: number;
    cy?: number;
    index?: number;
    payload?: Record<string, unknown>;
  }): ReactElement => {
    const { cx, cy, index, payload } = props;
    if (cx === undefined || cy === undefined || payload?.[valueKey] == null || Number.isNaN(cy)) {
      return <g key={`gap-${index}`} />;
    }
    const current = index === lastIndex;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={current ? 4.5 : 2.5}
        fill={current ? LINE : "var(--surface-alt)"}
        stroke={LINE}
        strokeWidth={1.8}
      />
    );
  };
  return Dot;
}

function lastIndexWith<T>(rows: T[], has: (r: T) => boolean): number {
  for (let i = rows.length - 1; i >= 0; i--) if (has(rows[i])) return i;
  return -1;
}

// ---------------------------------------------------------------------------

export function WeeklyVolumeChart({ data }: { data: WeekVolume[] }) {
  const reduced = useReducedMotion();
  return (
    <div role="img" aria-label="Wochen-Laufvolumen in Kilometern, letzte 16 Wochen" className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="weekStart"
            tickFormatter={fmtDayShort}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            interval={1}
            tickMargin={8}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickCount={5} unit=" km" width={56} />
          <Tooltip
            cursor={{ fill: "var(--chart-band)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as WeekVolume | undefined;
              return (
                <Tip
                  active={active}
                  title={row ? `Woche ab ${fmtDayLong(row.weekStart)}` : ""}
                  rows={row ? [{ label: "Laufen", value: fmtKm(row.km) }] : []}
                />
              );
            }}
          />
          <Bar dataKey="km" radius={[8, 8, 0, 0]} maxBarSize={28} isAnimationActive={!reduced}>
            {data.map((w, i) => (
              <Cell key={w.weekStart} fill={i === data.length - 1 ? "var(--accent)" : LINE} fillOpacity={i === data.length - 1 ? 1 : 0.82} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function VitalsLineChart({
  data,
  dataKey,
  label,
  unit,
  band,
}: {
  data: VitalsPoint[];
  dataKey: "hrv" | "restingHr";
  label: string;
  unit: string;
  band?: { low: number; high: number } | null;
}) {
  const reduced = useReducedMotion();
  const values = data.map((d) => d[dataKey]).filter((v): v is number => v !== null);
  const lo = Math.min(...values, band?.low ?? Infinity);
  const hi = Math.max(...values, band?.high ?? -Infinity);
  const domain: [number, number] = values.length ? [Math.floor(lo - 3), Math.ceil(hi + 3)] : [0, 100];
  const last = lastIndexWith(data, (d) => d[dataKey] !== null);

  return (
    <div role="img" aria-label={`${label}, letzte 60 Tage`} className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          {band && <ReferenceArea y1={band.low} y2={band.high} fill="var(--chart-band)" fillOpacity={1} ifOverflow="extendDomain" />}
          <XAxis
            dataKey="date"
            tickFormatter={fmtDayShort}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            minTickGap={36}
            tickMargin={8}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain} tickCount={4} width={44} />
          <Tooltip
            cursor={{ stroke: "var(--line)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as VitalsPoint | undefined;
              const v = row?.[dataKey];
              return (
                <Tip
                  active={active}
                  title={row ? fmtDayLong(row.date) : ""}
                  rows={v != null ? [{ label, value: `${v} ${unit}` }] : []}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={LINE}
            strokeWidth={1.8}
            connectNulls
            dot={dotRenderer(last, dataKey)}
            activeDot={{ r: 5, fill: LINE, stroke: LINE }}
            isAnimationActive={!reduced}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

const SLEEP_STAGES = [
  { key: "deep", label: "Tief", fill: "var(--chart-line)", opacity: 1 },
  { key: "rem", label: "REM", fill: "var(--accent)", opacity: 1 },
  { key: "light", label: "Leicht", fill: "var(--chart-line)", opacity: 0.32 },
  { key: "awake", label: "Wach", fill: "var(--chart-line)", opacity: 0.1 },
] as const;

export function SleepChart({ data }: { data: SleepPoint[] }) {
  const reduced = useReducedMotion();
  // Nights without a stage breakdown fall back to a single total bar.
  const rows = data.map((d) => {
    const staged = d.deep !== null || d.light !== null || d.rem !== null;
    return { ...d, total: staged ? null : d.hours };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
        {SLEEP_STAGES.map((st) => (
          <span key={st.key} className="t-small flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: st.fill, opacity: st.opacity }} />
            {st.label}
          </span>
        ))}
      </div>
      <div role="img" aria-label="Schlafphasen pro Nacht (Tief, REM, Leicht, Wach), letzte 28 Tage" className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDayShort}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tickMargin={8}
            />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} unit=" h" width={48} />
            <Tooltip
              cursor={{ fill: "var(--chart-band)" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as SleepPoint | undefined;
                const rows: TipRow[] = [];
                if (row?.hours != null) rows.push({ label: "Gesamt", value: fmtHours(row.hours) });
                for (const st of SLEEP_STAGES) {
                  const v = row?.[st.key];
                  if (v != null) rows.push({ label: st.label, value: fmtHours(v) });
                }
                if (row?.score != null) rows.push({ label: "Score", value: String(row.score) });
                return <Tip active={active} title={row ? fmtDayLong(row.date) : ""} rows={rows} />;
              }}
            />
            {SLEEP_STAGES.map((st) => (
              <Bar
                key={st.key}
                dataKey={st.key}
                stackId="sleep"
                fill={st.fill}
                fillOpacity={st.opacity}
                maxBarSize={18}
                isAnimationActive={!reduced}
              />
            ))}
            <Bar
              dataKey="total"
              stackId="sleep"
              fill="var(--chart-line)"
              fillOpacity={0.32}
              maxBarSize={18}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduced}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const ZONE_OPACITY = [0.22, 0.38, 0.55, 0.78, 1];

export function ZonesChart({ data, floors }: { data: TrainingWeek[]; floors?: number[] }) {
  const reduced = useReducedMotion();
  const rows = data.map((w) => ({
    weekStart: w.weekStart,
    ...Object.fromEntries(w.zoneMinutes.map((m, i) => [`z${i + 1}`, m / 60])),
  }));
  const zoneLabel = (i: number) => (floors ? `Zone ${i + 1} · ab ${floors[i]} bpm` : `Zone ${i + 1}`);

  return (
    <div role="img" aria-label="Trainingszeit pro Herzfrequenz-Zone und Woche" className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="weekStart" tickFormatter={fmtDayShort} tick={AXIS} tickLine={false} axisLine={false} interval={1} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickCount={5} unit=" h" width={48} />
          <Tooltip
            cursor={{ fill: "var(--chart-band)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Record<string, number | string> | undefined;
              const rows: TipRow[] = row
                ? [4, 3, 2, 1, 0]
                    .filter((i) => Number(row[`z${i + 1}`]) > 0)
                    .map((i) => ({ label: zoneLabel(i), value: fmtHours(Number(row[`z${i + 1}`])) }))
                : [];
              return <Tip active={active} title={row ? `Woche ab ${fmtDayLong(String(row.weekStart))}` : ""} rows={rows} />;
            }}
          />
          {ZONE_OPACITY.map((opacity, i) => (
            <Bar
              key={i}
              dataKey={`z${i + 1}`}
              stackId="zones"
              fill={LINE}
              fillOpacity={opacity}
              maxBarSize={28}
              radius={i === 4 ? [8, 8, 0, 0] : 0}
              isAnimationActive={!reduced}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrainingLoadChart({ data }: { data: TrainingWeek[] }) {
  const reduced = useReducedMotion();
  const last = data.length - 1;
  return (
    <div role="img" aria-label="Trainingsbelastung pro Woche" className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="weekStart" tickFormatter={fmtDayShort} tick={AXIS} tickLine={false} axisLine={false} interval={1} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickCount={4} width={48} />
          <Tooltip
            cursor={{ stroke: "var(--line)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as TrainingWeek | undefined;
              return (
                <Tip
                  active={active}
                  title={row ? `Woche ab ${fmtDayLong(row.weekStart)}` : ""}
                  rows={row ? [{ label: "Belastung", value: String(row.load) }] : []}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="load" stroke={LINE} strokeWidth={1.8} dot={dotRenderer(last, "load")} activeDot={{ r: 5, fill: LINE, stroke: LINE }} isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StepsChart({ data }: { data: StepsPoint[] }) {
  const reduced = useReducedMotion();
  const goal = [...data].reverse().find((d) => d.goal !== null)?.goal ?? null;
  const last = lastIndexWith(data, (d) => d.steps !== null);
  return (
    <div role="img" aria-label="Schritte pro Tag, letzte 60 Tage" className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="date" tickFormatter={fmtDayShort} tick={AXIS} tickLine={false} axisLine={false} minTickGap={36} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickCount={5} width={52} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          {goal !== null && <ReferenceLine y={goal} stroke="var(--fg-muted)" strokeDasharray="4 4" strokeOpacity={0.7} />}
          <Tooltip
            cursor={{ fill: "var(--chart-band)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as StepsPoint | undefined;
              const rows: TipRow[] = [];
              if (row?.steps != null) rows.push({ label: "Schritte", value: row.steps.toLocaleString("de-DE") });
              if (row?.goal != null) rows.push({ label: "Ziel", value: row.goal.toLocaleString("de-DE") });
              return <Tip active={active} title={row ? fmtDayLong(row.date) : ""} rows={rows} />;
            }}
          />
          <Bar dataKey="steps" radius={[4, 4, 0, 0]} maxBarSize={10} isAnimationActive={!reduced}>
            {data.map((d, i) => (
              <Cell key={d.date} fill={i === last ? "var(--accent)" : LINE} fillOpacity={i === last ? 1 : 0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BodyBatteryChart({ data }: { data: BodyBatteryPoint[] }) {
  const reduced = useReducedMotion();
  const rows = data.map((d) => ({ date: d.date, range: d.min !== null && d.max !== null ? [d.min, d.max] : null, min: d.min, max: d.max }));
  return (
    <div role="img" aria-label="Body Battery Tagesspanne, letzte 60 Tage" className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="date" tickFormatter={fmtDayShort} tick={AXIS} tickLine={false} axisLine={false} minTickGap={36} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44} />
          <Tooltip
            cursor={{ fill: "var(--chart-band)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as { date: string; min: number | null; max: number | null } | undefined;
              const rows: TipRow[] = [];
              if (row?.max != null) rows.push({ label: "Höchstwert", value: `${row.max} %` });
              if (row?.min != null) rows.push({ label: "Tiefstwert", value: `${row.min} %` });
              return <Tip active={active} title={row ? fmtDayLong(row.date) : ""} rows={rows} />;
            }}
          />
          <Bar dataKey="range" fill={LINE} fillOpacity={0.6} radius={4} maxBarSize={8} isAnimationActive={!reduced} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic single-series line for sparse or smooth daily values. */
export function SeriesLineChart({
  data,
  label,
  unit,
  height = 220,
  decimals = 0,
}: {
  data: { date: string; value: number | null }[];
  label: string;
  unit: string;
  height?: number;
  decimals?: number;
}) {
  const reduced = useReducedMotion();
  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const pad = decimals ? 1 : 3;
  const domain: [number, number] = values.length
    ? [Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)]
    : [0, 100];
  const last = lastIndexWith(data, (d) => d.value !== null);
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="date" tickFormatter={fmtDayShort} tick={AXIS} tickLine={false} axisLine={false} minTickGap={36} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain} tickCount={4} width={44} />
          <Tooltip
            cursor={{ stroke: "var(--line)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as { date: string; value: number | null } | undefined;
              const v = row?.value;
              return (
                <Tip
                  active={active}
                  title={row ? fmtDayLong(row.date) : ""}
                  rows={v != null ? [{ label, value: `${v.toLocaleString("de-DE", { maximumFractionDigits: decimals })} ${unit}` }] : []}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="value" stroke={LINE} strokeWidth={1.8} connectNulls dot={dotRenderer(last, "value")} activeDot={{ r: 5, fill: LINE, stroke: LINE }} isAnimationActive={!reduced} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
