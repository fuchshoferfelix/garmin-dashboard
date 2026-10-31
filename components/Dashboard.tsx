"use client";

import { useEffect, useState } from "react";
import { ActivityDialog } from "./ActivityDialog";
import { ActivityCalendar } from "./Calendar";
import { ExportButtons } from "./ExportButtons";
import { Heatmap } from "./Heatmap";
import { Reveal } from "./Reveal";
import { StrongSection } from "./StrongSection";
import {
  BodyBatteryChart,
  SeriesLineChart,
  SleepChart,
  StepsChart,
  TrainingLoadChart,
  VitalsLineChart,
  WeeklyVolumeChart,
  ZonesChart,
} from "./Charts";
import { ThemeToggle } from "./ThemeToggle";
import { fmtHours, fmtKm, relativeDay } from "@/lib/format";
import { mockDashboard } from "@/lib/mock";
import type { ActivityRow, ApiError, DashboardData, HeaderMetric } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData }
  | { status: "fallback"; data: DashboardData; message: string };

export function Dashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/garmin/dashboard", { signal: controller.signal });
        if (res.ok) {
          setState({ status: "ready", data: (await res.json()) as DashboardData });
          return;
        }
        const body = (await res.json().catch(() => null)) as ApiError | null;
        setState({
          status: "fallback",
          data: mockDashboard(),
          message: body?.error ?? "Die Daten konnten nicht geladen werden.",
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "fallback",
          data: mockDashboard(),
          message: err instanceof Error ? "Die Daten konnten nicht geladen werden." : "Unbekannter Fehler.",
        });
      }
    })();
    return () => controller.abort();
  }, []);

  const sample = state.status === "fallback";

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-32 sm:px-6">
        <Hero sample={sample} loading={state.status === "loading"} updatedAt={state.status === "ready" ? state.data.generatedAt : null}>
          {state.status !== "loading" && <ExportButtons data={state.data} sample={sample} />}
        </Hero>

        {state.status === "fallback" && (
          <div role="alert" className="card mb-8 flex flex-col gap-1">
            <span className="t-title">Verbindung zu Garmin fehlt noch</span>
            <span className="t-body text-fg-muted">{state.message}</span>
          </div>
        )}

        {state.status === "loading" ? <Skeleton /> : <Content data={state.data} sample={sample} />}
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------

function Nav() {
  const links = [
    ["ueberblick", "Überblick"],
    ["training", "Training"],
    ["kraft", "Kraft"],
    ["karte", "Karte"],
    ["erholung", "Erholung"],
    ["alltag", "Alltag"],
    ["kalender", "Kalender"],
  ];
  const [active, setActive] = useState("ueberblick");

  useEffect(() => {
    const onScroll = () => {
      // Last section whose top has passed the nav; stays correct as sections mount after loading.
      let current = links[0][0];
      for (const [id] of links) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-20 flex justify-center px-4">
      <nav
        aria-label="Hauptnavigation"
        className="glass nav-pill flex w-full max-w-[900px] items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-5"
      >
        <span className="t-title hidden sm:block">Training</span>
        <ul className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-4 overflow-x-auto px-1 sm:flex-none sm:gap-6">
          {links.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                className={`nav-link text-[13px] transition-colors hover:text-fg ${active === id ? "is-active" : "text-fg-muted"}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <ThemeToggle />
      </nav>
    </header>
  );
}

function Hero({
  sample,
  loading,
  updatedAt,
  children,
}: {
  sample: boolean;
  loading: boolean;
  updatedAt: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section id="ueberblick" className="mb-12 flex flex-col items-start gap-4">
      <p className="t-kicker">Dein Training</p>
      <h1 className="t-headline max-w-[14ch]">Ruhig auf den Verlauf schauen.</h1>
      <p className="t-body max-w-[52ch] text-fg-muted">
        Deine Garmin-Daten, ohne Bewertung. Du siehst, was war – und entscheidest selbst, was es bedeutet.
      </p>
      {sample && <span className="chip">Beispieldaten</span>}
      {loading && <span className="chip">Lade deine Daten …</span>}
      {updatedAt && (
        <span className="chip">
          Stand{" "}
          {new Date(updatedAt).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })} Uhr
        </span>
      )}
      {children}
    </section>
  );
}

function Content({ data, sample }: { data: DashboardData; sample: boolean }) {
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const running = data.weeks.reduce((sum, w) => sum + w.km, 0);
  const hasVitals = data.vitals.some((v) => v.hrv !== null || v.restingHr !== null);
  const sleepHours = data.sleep.flatMap((s) => (s.hours !== null ? [s.hours] : []));
  const hasSleep = sleepHours.length > 0;
  const sleepAvg = hasSleep ? sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length : null;
  const hasZones = data.trainingWeeks.some((w) => w.zoneMinutes.some((m) => m > 0));
  const hasSteps = data.steps.some((d) => d.steps !== null);
  const hasStress = data.stress.some((d) => d.avg !== null);
  const hasBattery = data.bodyBattery.some((d) => d.max !== null);

  return (
    <div className="flex flex-col gap-24">
      <HeaderMetrics data={data} />

      <Section id="training" kicker="Training" title="Dein Wochenvolumen.">
        <ChartCard title="Laufkilometer pro Woche" subtitle={`Letzte 16 Wochen · gesamt ${fmtKm(running)}`}>
          <WeeklyVolumeChart data={data.weeks} />
        </ChartCard>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Herzfrequenz-Zonen" subtitle="Trainingszeit pro Woche">
            {hasZones ? (
              <>
                <ZonesChart data={data.trainingWeeks} floors={data.zones?.floors} />
                <ZoneLegend zones={data.zones} />
              </>
            ) : (
              <p className="t-body text-fg-muted">Keine Zonen-Zeiten im Zeitraum.</p>
            )}
          </ChartCard>
          <ChartCard title="Trainingsbelastung" subtitle="Summe pro Woche">
            <TrainingLoadChart data={data.trainingWeeks} />
          </ChartCard>
        </div>
      </Section>

      <Section id="kraft" kicker="Kraft" title="Dein Krafttraining.">
        <StrongSection />
      </Section>

      <Section id="karte" kicker="Karte" title="Alle deine Läufe.">
        <Heatmap sample={sample} />
      </Section>

      <Section id="erholung" kicker="Erholung" title="Puls, HRV und Schlaf.">
        {hasVitals ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="HRV" subtitle="Nächtlicher Ø in ms · 60 Tage">
              <VitalsLineChart data={data.vitals} dataKey="hrv" label="HRV" unit="ms" band={data.hrvBaseline} />
              {data.hrvBaseline && (
                <p className="t-small mt-2">
                  Graues Band: dein Referenzbereich ({data.hrvBaseline.low}–{data.hrvBaseline.high} ms).
                </p>
              )}
            </ChartCard>
            <ChartCard title="Ruhepuls" subtitle="In bpm · 60 Tage">
              <VitalsLineChart data={data.vitals} dataKey="restingHr" label="Ruhepuls" unit="bpm" />
            </ChartCard>
          </div>
        ) : (
          <EmptyCard text="Für die letzten 60 Tage liegen keine HRV- oder Ruhepuls-Werte vor." />
        )}

        <ChartCard title="Schlaf" subtitle={sleepAvg ? `Phasen in h pro Nacht · Ø ${fmtHours(sleepAvg)} · 28 Tage` : "Phasen in h pro Nacht · 28 Tage"} className="mt-4">
          {hasSleep ? <SleepChart data={data.sleep} /> : <p className="t-body text-fg-muted">Keine Schlafdaten im Zeitraum.</p>}
        </ChartCard>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ChartCard title="Body Battery" subtitle="Tagesspanne in % · 60 Tage">
            {hasBattery ? <BodyBatteryChart data={data.bodyBattery} /> : <p className="t-body text-fg-muted">Keine Daten im Zeitraum.</p>}
          </ChartCard>
          <ChartCard title="Stress" subtitle="Tagesdurchschnitt · 60 Tage">
            {hasStress ? (
              <SeriesLineChart
                data={data.stress.map((d) => ({ date: d.date, value: d.avg }))}
                label="Stress"
                unit=""
                height={240}
              />
            ) : (
              <p className="t-body text-fg-muted">Keine Daten im Zeitraum.</p>
            )}
          </ChartCard>
        </div>
      </Section>

      <Section id="alltag" kicker="Alltag" title="Bewegung und Gewicht.">
        <ChartCard title="Schritte" subtitle="Pro Tag · gestrichelt: dein Ziel · 60 Tage">
          {hasSteps ? <StepsChart data={data.steps} /> : <p className="t-body text-fg-muted">Keine Schrittdaten im Zeitraum.</p>}
        </ChartCard>
        <ChartCard title="Gewicht" subtitle="In kg · 90 Tage" className="mt-4">
          {data.weight.length > 0 ? (
            <SeriesLineChart
              data={data.weight.map((w) => ({ date: w.date, value: w.kg }))}
              label="Gewicht"
              unit="kg"
              decimals={1}
              height={200}
            />
          ) : (
            <p className="t-body text-fg-muted">In den letzten 90 Tagen hast du kein Gewicht eingetragen.</p>
          )}
        </ChartCard>
      </Section>

      <Section id="kalender" kicker="Kalender" title="Wann du unterwegs warst.">
        {data.activities.length === 0 ? (
          <EmptyCard text="Keine Aktivitäten im Zeitraum." />
        ) : (
          <ActivityCalendar rows={data.activities} onSelect={setSelected} />
        )}
      </Section>
      {selected && <ActivityDialog row={selected} sample={sample} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section id={id}>
        <p className="t-kicker mb-3">{kicker}</p>
        <h2 className="t-headline mb-8">{title}</h2>
        {children}
      </section>
    </Reveal>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-title">{title}</h3>
        <span className="t-small">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function ZoneLegend({ zones }: { zones: DashboardData["zones"] }) {
  const opacity = [0.22, 0.38, 0.55, 0.78, 1];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Zonen-Legende">
      {opacity.map((o, i) => (
        <li key={i} className="t-small flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--chart-line)", opacity: o }} />
          Zone {i + 1}
          {zones && ` · ab ${zones.floors[i]} bpm`}
        </li>
      ))}
    </ul>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="card">
      <p className="t-body text-fg-muted">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Mean of the last 7 non-empty values. */
function avg7(series: (number | null)[]): number | null {
  const vals = series.filter((v): v is number => v !== null).slice(-7);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function HeaderMetrics({ data }: { data: DashboardData }) {
  const items: {
    label: string;
    unit: string;
    metric: HeaderMetric;
    caption: (date: string) => string;
    avg: number | null;
  }[] = [
    { label: "Ruhepuls", unit: "bpm", metric: data.header.restingHr, caption: (d) => relativeDay(d), avg: avg7(data.vitals.map((v) => v.restingHr)) },
    { label: "HRV", unit: "ms", metric: data.header.hrv, caption: (d) => `Nacht auf ${relativeDay(d)}`, avg: avg7(data.vitals.map((v) => v.hrv)) },
    { label: "Schlaf-Score", unit: "", metric: data.header.sleepScore, caption: (d) => `Nacht auf ${relativeDay(d)}`, avg: avg7(data.sleep.map((v) => v.score)) },
    { label: "Body Battery", unit: "%", metric: data.header.bodyBattery, caption: (d) => `Stand ${relativeDay(d)}`, avg: avg7(data.bodyBattery.map((v) => v.max)) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <Reveal key={item.label} delay={i * 80}>
          <div className="glass flex h-full flex-col justify-between gap-6 p-6">
            <span className="t-kicker">{item.label}</span>
            <div>
              {item.metric ? (
                <>
                  <p className="t-metric">
                    {Math.round(item.metric.value)}
                    {item.unit && <sup>{item.unit}</sup>}
                  </p>
                  <p className="t-small mt-2">
                    {item.caption(item.metric.date)}
                    {item.avg !== null && ` · Ø 7 Tage ${Math.round(item.avg)}`}
                  </p>
                </>
              ) : (
                <>
                  <p className="t-metric text-fg-muted">–</p>
                  <p className="t-small mt-2">Kein Wert vorhanden</p>
                </>
              )}
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Daten werden geladen">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass pulse h-[196px]" />
        ))}
      </div>
      <div className="card pulse h-[360px]" />
    </div>
  );
}
