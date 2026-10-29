"use client";

import { useMemo, useState, type ReactNode } from "react";
import { fmtDayLong, fmtDuration, fmtKm, fmtPace, isRunLike, sportLabel } from "@/lib/format";
import type { ActivityRow } from "@/lib/types";

type Group = "run" | "walk" | "bike" | "swim" | "strength" | "yoga" | "other";

const GROUP_LABEL: Record<Group, string> = {
  run: "Laufen",
  walk: "Gehen & Wandern",
  bike: "Radfahren",
  swim: "Schwimmen",
  strength: "Kraft & Cardio",
  yoga: "Yoga & Mobility",
  other: "Sonstiges",
};

function groupOf(key: string): Group {
  if (/walking|hiking/.test(key)) return "walk";
  if (isRunLike(key)) return "run";
  if (/cycl|bik|ride/.test(key)) return "bike";
  if (/swim/.test(key)) return "swim";
  if (/strength|hiit|cardio|elliptical|rowing/.test(key)) return "strength";
  if (/yoga|pilates/.test(key)) return "yoga";
  return "other";
}

const ICONS: Record<Group, ReactNode> = {
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M12 8.5l-3 2.5 3 2.5-1.5 5.5M12 8.5l3.5 2.5 2.5-.5M9 11l-3 .5M12 13.5l3.5 1.5.5 4.5" />
    </>
  ),
  walk: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 8v5l-2.5 7M12 13l3 7M9 10.5l3-2.5 3 2.5" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-8h5l3 8M10 8l5 8M13 6h3" />
    </>
  ),
  swim: (
    <>
      <circle cx="16.5" cy="7" r="1.8" />
      <path d="M7 13l5-3 4 2M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M3 21c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    </>
  ),
  strength: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  yoga: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 8v5M12 13l-4 6M12 13l4 6M6.5 10h11" />
    </>
  ),
  other: <path d="M13 3L4 14h7l-1 7 9-11h-7z" />,
};

function SportIcon({ group, size = 20 }: { group: Group; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ICONS[group]}
    </svg>
  );
}

// ---------------------------------------------------------------------------

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_FMT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const MAX_ICONS = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const monthKey = (iso: string) => iso.slice(0, 7);

function effort(a: ActivityRow): string {
  if (isRunLike(a.sportKey) && a.paceSecPerKm !== null) return fmtPace(a.paceSecPerKm);
  if (a.powerW !== null) return `${Math.round(a.powerW)} W`;
  if (a.speedKmh !== null) return `${a.speedKmh.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km/h`;
  return "–";
}

function extras(a: ActivityRow): string {
  const parts: string[] = [];
  if (a.elevationGain !== null && a.elevationGain > 0) parts.push(`${Math.round(a.elevationGain)} Hm`);
  if (a.cadence !== null) parts.push(`${Math.round(a.cadence)} spm`);
  if (a.trainingLoad !== null) parts.push(`Belastung ${Math.round(a.trainingLoad)}`);
  return parts.join(" · ");
}

/** Month calendar with one icon per activity; selecting a day lists its activities below. */
export function ActivityCalendar({ rows, onSelect }: { rows: ActivityRow[]; onSelect: (a: ActivityRow) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const a of rows) {
      const day = a.start.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), a]);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [rows]);

  const now = new Date();
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const latestDay = rows.length > 0 ? rows.reduce((max, a) => (a.start > max ? a.start : max), rows[0].start).slice(0, 10) : todayIso;
  const earliestDay = rows.length > 0 ? rows.reduce((min, a) => (a.start < min ? a.start : min), rows[0].start).slice(0, 10) : todayIso;

  const [view, setView] = useState(() => ({ y: Number(latestDay.slice(0, 4)), m: Number(latestDay.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState<string | null>(rows.length > 0 ? latestDay : null);

  const viewKey = `${view.y}-${pad(view.m + 1)}`;
  const canPrev = viewKey > monthKey(earliestDay);
  const canNext = viewKey < monthKey(todayIso);

  function go(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() };
    const key = `${next.y}-${pad(next.m + 1)}`;
    setView(next);
    const days = [...byDay.keys()].filter((k) => monthKey(k) === key).sort();
    setSelected(days.length > 0 ? days[days.length - 1] : null);
  }

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthRows = rows.filter((a) => monthKey(a.start.slice(0, 10)) === viewKey);
  const monthKm = monthRows.reduce((sum, a) => sum + (a.distanceKm ?? 0), 0);
  const monthSeconds = monthRows.reduce((sum, a) => sum + a.durationS, 0);
  const monthGroups = [...new Set(monthRows.map((a) => groupOf(a.sportKey)))];
  const activeDays = new Set(monthRows.map((a) => a.start.slice(0, 10))).size;

  const dayRows = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="panel">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-pill" onClick={() => go(-1)} disabled={!canPrev} aria-label="Vorheriger Monat">
            ←
          </button>
          <h3 className="t-title min-w-[10.5ch] text-center capitalize" aria-live="polite">
            {MONTH_FMT.format(new Date(view.y, view.m, 1))}
          </h3>
          <button type="button" className="btn-pill" onClick={() => go(1)} disabled={!canNext} aria-label="Nächster Monat">
            →
          </button>
        </div>
        <p className="t-small">
          {monthRows.length === 0
            ? "Keine Aktivitäten"
            : `${monthRows.length} ${monthRows.length === 1 ? "Aktivität" : "Aktivitäten"} · ${activeDays} aktive Tage${monthKm > 0 ? ` · ${fmtKm(monthKm)}` : ""} · ${fmtDuration(monthSeconds)}`}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <span key={d} className="t-small pb-1 text-center">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} aria-hidden="true" />;
          const iso = isoOf(view.y, view.m, day);
          const list = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          const isFuture = iso > todayIso;
          const isSelected = iso === selected;
          const km = list.reduce((sum, a) => sum + (a.distanceKm ?? 0), 0);
          const shown = list.slice(0, MAX_ICONS);
          const body = (
            <>
              <span className={`cal-num ${isToday ? "cal-today" : ""}`}>{day}</span>
              {list.length > 0 && (
                <span className="flex flex-wrap items-center justify-center gap-0.5 text-accent">
                  {shown.map((a) => (
                    <SportIcon key={a.id} group={groupOf(a.sportKey)} size={18} />
                  ))}
                  {list.length > MAX_ICONS && <span className="t-small">+{list.length - MAX_ICONS}</span>}
                </span>
              )}
              {km > 0 && <span className="t-small hidden text-[11px] sm:block">{km.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km</span>}
            </>
          );
          const cls = `cal-day ${isSelected ? "is-selected" : ""} ${isFuture ? "opacity-40" : ""}`;
          return list.length > 0 ? (
            <button
              key={iso}
              type="button"
              className={`${cls} cal-active`}
              aria-pressed={isSelected}
              aria-label={`${fmtDayLong(iso)}: ${list.map((a) => sportLabel(a.sportKey)).join(", ")}`}
              onClick={() => setSelected(iso)}
            >
              {body}
            </button>
          ) : (
            <div key={iso} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {monthGroups.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Legende">
          {monthGroups.map((g) => (
            <li key={g} className="t-small flex items-center gap-2">
              <span className="text-accent">
                <SportIcon group={g} size={16} />
              </span>
              {GROUP_LABEL[g]}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-line pt-5" aria-live="polite">
        {selected && dayRows.length > 0 ? (
          <>
            <p className="t-kicker mb-2">{fmtDayLong(selected)}</p>
            <ul>
              {dayRows.map((a) => (
                <li key={a.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    onClick={() => onSelect(a)}
                    aria-label={`${sportLabel(a.sportKey)} am ${fmtDayLong(a.start)} im Detail ansehen`}
                    className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-band focus-visible:bg-band"
                  >
                    <span className="text-accent">
                      <SportIcon group={groupOf(a.sportKey)} size={26} />
                    </span>
                    <span>
                      <span className="t-title block">{a.name || sportLabel(a.sportKey)}</span>
                      <span className="t-small block">
                        {[
                          sportLabel(a.sportKey),
                          a.start.slice(11, 16) !== "00:00" ? `${a.start.slice(11, 16)} Uhr` : null,
                          extras(a) || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex items-center gap-4 text-right">
                      <span className="hidden sm:block">
                        <span className="t-body block">{a.distanceKm !== null ? fmtKm(a.distanceKm) : fmtDuration(a.durationS)}</span>
                        <span className="t-small block">
                          {a.distanceKm !== null ? `${fmtDuration(a.durationS)} · ${effort(a)}` : effort(a) !== "–" ? effort(a) : ""}
                          {a.avgHr !== null && ` · ${Math.round(a.avgHr)} bpm`}
                        </span>
                      </span>
                      <span className="block sm:hidden">
                        <span className="t-body block">{a.distanceKm !== null ? fmtKm(a.distanceKm) : fmtDuration(a.durationS)}</span>
                      </span>
                      <span aria-hidden="true" className="text-fg-muted">
                        ›
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="t-body text-fg-muted">
            {monthRows.length > 0 ? "Wähle einen Tag mit Symbol, um die Aktivitäten zu sehen." : "In diesem Monat gibt es keine Aktivitäten."}
          </p>
        )}
      </div>
    </div>
  );
}
