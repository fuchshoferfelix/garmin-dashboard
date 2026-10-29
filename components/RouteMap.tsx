"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { LatLon } from "@/lib/types";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/**
 * Leaflet map on a calm OpenStreetMap base (dark mode via CSS filter). `heat` draws many translucent routes whose overlaps
 * accumulate into a heatmap; `single` draws one route with start/end and an optional
 * highlighted position (synced from the detail charts).
 */
export function RouteMap({
  routes,
  mode,
  highlight = null,
  label,
  className = "h-[480px]",
}: {
  routes: LatLon[][];
  mode: "heat" | "single";
  highlight?: LatLon | null;
  label: string;
  className?: string;
}) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark" as const);
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || routes.length === 0) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const L = await import("leaflet");
      if (disposed) return;

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e2b36f";
      const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, preferCanvas: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

      // Wheel zoom only after a click into the map, so page scrolling is never hijacked.
      map.on("click focus", () => map.scrollWheelZoom.enable());
      map.on("mouseout blur", () => map.scrollWheelZoom.disable());

      const canvas = L.canvas({ padding: 0.5 });
      const bounds = L.latLngBounds([]);
      for (const route of routes) {
        const line = L.polyline(route, {
          renderer: canvas,
          color: accent,
          weight: mode === "heat" ? 3 : 4,
          opacity: mode === "heat" ? 0.22 : 0.95,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(map);
        bounds.extend(line.getBounds());
      }

      if (mode === "single") {
        const route = routes[0];
        const dot = (at: LatLon, fill: string) =>
          L.circleMarker(at, { radius: 6, color: accent, weight: 2, fillColor: fill, fillOpacity: 1, interactive: false }).addTo(map);
        dot(route[0], accent);
        dot(route[route.length - 1], getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#0b0b0a");
        marker.current = L.circleMarker(route[0], {
          radius: 7,
          color: getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#faf8f3",
          weight: 2,
          fillColor: accent,
          fillOpacity: 0,
          opacity: 0,
          interactive: false,
        }).addTo(map);
      }

      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      cleanup = () => {
        marker.current = null;
        map.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [routes, mode, theme]);

  useEffect(() => {
    const m = marker.current;
    if (!m) return;
    if (highlight) {
      m.setLatLng(highlight);
      m.setStyle({ opacity: 1, fillOpacity: 1 });
    } else {
      m.setStyle({ opacity: 0, fillOpacity: 0 });
    }
  }, [highlight]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={`route-map w-full overflow-hidden rounded-[24px] border border-line bg-surface-alt ${className}`}
    />
  );
}
