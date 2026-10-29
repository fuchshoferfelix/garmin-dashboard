"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, LINE, Tip, useReducedMotion } from "./Charts";
import { RouteMap } from "./RouteMap";
import { fmtDayLong, fmtDuration, fmtKm, fmtPace, isRunLike, sportLabel } from "@/lib/format";
import { mockActivityDetail } from "@/lib/mock";
import type { ActivityDetail, ActivityRow, DetailPoint, LatLon } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "ready"; detail: ActivityDetail }
  | { status: "error"; message: string };

/** Modal detail view for one activity: route, key numbers, profiles and heart-rate zones. */
export function ActivityDialog({ row, sample, onClose }: { row: ActivityRow; sample: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fetched, setState] = useState<State>({ status: "loading" });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const mock = useMemo(() => (sample ? mockActivityDetail(row) : null), [sample, row]);
  const state: State = mock ? { status: "ready", detail: mock } : fetched;

  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/garmin/activity/${row.id}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        setState({ status: "ready", detail: (await res.json()) as ActivityDetail });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: "Die Details dieser Aktivität konnten nicht geladen werden." });
      }
    })();
    return () => controller.abort();
  }, [row, sample]);

  const detail = state.status === "ready" ? state.detail : null;
  const routes = useMemo(() => (detail && detail.track.length > 1 ? [detail.track] : []), [detail]);
  const at = hover !== null ? detail?.points[hover] : undefined;
  const highlight: LatLon | null = at && at.lat !== null && at.lon !== null ? [at.lat, at.lon] : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="activity-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto max-h-[92vh] w-[min(1040px,calc(100vw-24px))] overflow-y-auto rounded-[28px] border border-line bg-surface p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-8 p-5 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="t-kicker mb-2">{sportLabel(row.sportKey)}</p>
            <h2 id="activity-title" className="t-headline !text-[clamp(28px,4vw,44px)]">
              {row.name || sportLabel(row.sportKey)}
            </h2>
            <p className="t-small mt-2">
              {fmtDayLong(row.start)} · {row.start.slice(11, 16)} Uhr
            </p>
          </div>
          <button type="button" className="btn-pill shrink-0" onClick={() => dialog.current?.close()}>
            Schließen
          </button>
        </header>

        <Stats row={row} detail={detail} />

        {state.status === "loading" && <div className="card pulse h-[360px]" aria-busy="true" aria-label="Details werden geladen" />}
        {state.status === "error" && (
          <div role="alert" className="card">
            <p className="t-body text-fg-muted">{state.message}</p>
          </div>
        )}

        {routes.length > 0 && <RouteMap routes={routes} mode="single" highlight={highlight} label={`Karte der Strecke: ${row.name}`} className="h-[min(440px,60vh)]" />}
        {detail && routes.length === 0 && (
          <p className="t-small">Keine GPS-Strecke vorhanden – vermutlich eine Indoor-Aktivität.</p>
        )}

        {detail && detail.points.length > 1 && (
          <Profiles row={row} points={detail.points} onHover={setHover} />
        )}

        {row.zoneSeconds && row.zoneSeconds.some((s) => s > 0) && <ZoneBar seconds={row.zoneSeconds} />}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------

function Stats({ row, detail }: { row: ActivityRow; detail: ActivityDetail | null }) {
  const run = isRunLike(row.sportKey);
  const maxHr = detail?.points.reduce<number | null>((m, p) => (p.hr !== null && (m === null || p.hr > m) ? p.hr : m), null) ?? null;
  const items: [string, string | null][] = [
    ["Distanz", row.distanceKm !== null ? fmtKm(row.distanceKm) : null],
    ["Dauer", fmtDuration(row.durationS)],
    run
      ? ["Ø Pace", row.paceSecPerKm !== null ? fmtPace(row.paceSecPerKm) : null]
      : ["Ø Tempo", row.speedKmh !== null ? `${row.speedKmh.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km/h` : null],
    ["Ø Puls", row.avgHr !== null ? `${Math.round(row.avgHr)} bpm` : null],
    ["Max. Puls", maxHr !== null ? `${Math.round(maxHr)} bpm` : null],
    ["Höhenmeter", row.elevationGain !== null && row.elevationGain > 0 ? `${Math.round(row.elevationGain)} m` : null],
    ["Leistung", row.powerW !== null ? `${Math.round(row.powerW)} W` : null],
    ["Kadenz", row.cadence !== null ? `${Math.round(row.cadence)} spm` : null],
    ["Belastung", row.trainingLoad !== null ? `${Math.round(row.trainingLoad)}` : null],
  ];
  const shown = items.filter((i): i is [string, string] => i[1] !== null);

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {shown.map(([label, value]) => (
        <div key={label} className="glass flex flex-col gap-2 p-4">
          <dt className="t-kicker">{label}</dt>
          <dd className="text-[26px] font-extralight leading-none tracking-tight tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type ProfileSpec = {
  key: string;
  title: string;
  unit: string;
  area?: boolean;
  reverse?: boolean;
  value: (p: DetailPoint) => number | null;
  format: (v: number) => string;
};

function Profiles({ row, points, onHover }: { row: ActivityRow; points: DetailPoint[]; onHover: (i: number | null) => void }) {
  const reduced = useReducedMotion();
  const run = isRunLike(row.sportKey);
  const specs: ProfileSpec[] = [
    run
      ? { key: "pace", title: "Pace", unit: "min/km", reverse: true, value: (p) => (p.kmh ? 3600 / p.kmh : null), format: (v) => fmtPace(v) }
      : { key: "speed", title: "Tempo", unit: "km/h", value: (p) => p.kmh, format: (v) => `${v.toFixed(1).replace(".", ",")} km/h` },
    { key: "hr", title: "Puls", unit: "bpm", value: (p) => p.hr, format: (v) => `${Math.round(v)} bpm` },
    { key: "ele", title: "Höhe", unit: "m", area: true, value: (p) => p.ele, format: (v) => `${Math.round(v)} m` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {specs.map((spec) => {
        const data = points.map((p, i) => ({ i, km: p.km, v: spec.value(p) }));
        const vals = data.flatMap((d) => (d.v !== null ? [d.v] : []));
        if (vals.length < 2) return null;
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        const pad = Math.max((hi - lo) * 0.15, 1);
        // Pace outliers (standing still) would flatten the curve: clamp to the 95th percentile.
        const sorted = [...vals].sort((a, b) => a - b);
        const top = spec.reverse ? sorted[Math.floor(sorted.length * 0.95)] : hi;
        const domain: [number, number] = [Math.floor(lo - pad), Math.ceil(top + pad)];
        const common = {
          data,
          margin: { top: 8, right: 8, left: -12, bottom: 0 },
          onMouseMove: (s: { activeTooltipIndex?: number | string | null }) => {
            const idx = Number(s.activeTooltipIndex);
            onHover(Number.isFinite(idx) ? data[idx]?.i ?? null : null);
          },
          onMouseLeave: () => onHover(null),
        };
        const axes = (
          <>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={(v: number) => `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")}`} unit=" km" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} tickMargin={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain} reversed={spec.reverse} allowDataOverflow tickCount={4} width={52} tickFormatter={(v: number) => (spec.reverse ? fmtPace(v).replace(" min/km", "") : String(Math.round(v)))} />
            <Tooltip
              cursor={{ stroke: "var(--fg-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as { km: number; v: number | null } | undefined;
                return <Tip active={active} title={d ? fmtKm(d.km) : ""} rows={d && d.v !== null ? [{ label: spec.title, value: spec.format(d.v) }] : []} />;
              }}
            />
          </>
        );
        return (
          <div key={spec.key} className="card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="t-title">{spec.title}</h3>
              <span className="t-small">{spec.unit} über die Distanz</span>
            </div>
            <div role="img" aria-label={`${spec.title} über die Distanz`} className="h-[170px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {spec.area ? (
                  <AreaChart {...common}>
                    {axes}
                    <Area type="monotone" dataKey="v" stroke={LINE} strokeWidth={1.6} fill="var(--chart-band)" fillOpacity={1} connectNulls dot={false} isAnimationActive={!reduced} />
                  </AreaChart>
                ) : (
                  <LineChart {...common}>
                    {axes}
                    <Line type="monotone" dataKey="v" stroke={LINE} strokeWidth={1.6} connectNulls dot={false} activeDot={{ r: 4.5, fill: LINE, stroke: LINE }} isAnimationActive={!reduced} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ZoneBar({ seconds }: { seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0);
  const opacity = [0.22, 0.38, 0.55, 0.78, 1];
  return (
    <div className="card">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3 className="t-title">Zeit in Herzfrequenz-Zonen</h3>
        <span className="t-small">{fmtDuration(total)}</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label="Anteil der Herzfrequenz-Zonen">
        {seconds.map((s, i) => (
          <span key={i} style={{ width: `${(s / total) * 100}%`, background: "var(--chart-line)", opacity: opacity[i] }} />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {seconds.map((s, i) => (
          <li key={i} className="t-small flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--chart-line)", opacity: opacity[i] }} />
            Zone {i + 1} · {fmtDuration(s)} · {Math.round((s / total) * 100)} %
          </li>
        ))}
      </ul>
    </div>
  );
}
