"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteMap } from "./RouteMap";
import { fmtKm } from "@/lib/format";
import { mockHeatmap } from "@/lib/mock";
import type { Heatmap as HeatmapData } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "ready"; data: HeatmapData }
  | { status: "error" };

/** All outdoor runs of the last year as translucent routes – frequent paths glow brighter. */
export function Heatmap({ sample }: { sample: boolean }) {
  const [fetched, setState] = useState<State>({ status: "loading" });
  const mock = useMemo(() => (sample ? mockHeatmap() : null), [sample]);
  const state: State = mock ? { status: "ready", data: mock } : fetched;

  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/garmin/heatmap", { signal: controller.signal });
        if (!res.ok) throw new Error();
        setState({ status: "ready", data: (await res.json()) as HeatmapData });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [sample]);

  if (state.status === "loading") {
    return (
      <div className="card pulse flex h-[480px] items-end" aria-busy="true" aria-label="Karte wird geladen">
        <p className="t-small">Lade GPS-Strecken deiner Läufe …</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="card">
        <p className="t-body text-fg-muted">Die GPS-Strecken konnten nicht geladen werden.</p>
      </div>
    );
  }
  const { data } = state;
  if (data.routes.length === 0) {
    return (
      <div className="card">
        <p className="t-body text-fg-muted">In den letzten {data.months} Monaten gibt es keine Läufe mit GPS-Strecke.</p>
      </div>
    );
  }

  return (
    <div className="card !p-3 sm:!p-4">
      <RouteMap routes={data.routes} mode="heat" label={`Heatmap von ${data.runs} Läufen`} />
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pb-1 pt-4">
        <span className="t-small">
          {data.runs} Läufe · {fmtKm(data.km)} · letzte {data.months} Monate
        </span>
        <span className="t-small">Je heller, desto öfter gelaufen · Klicken, dann Mausrad zum Zoomen</span>
      </div>
    </div>
  );
}
