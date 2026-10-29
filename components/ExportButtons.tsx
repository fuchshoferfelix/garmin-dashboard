"use client";

import { useState } from "react";
import { dashboardToMarkdown } from "@/lib/export";
import type { DashboardData } from "@/lib/types";

export function ExportButtons({ data, sample }: { data: DashboardData; sample: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const flash = (next: "copied" | "failed") => {
    setStatus(next);
    setTimeout(() => setStatus("idle"), 2500);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dashboardToMarkdown(data, sample));
      flash("copied");
    } catch {
      flash("failed");
    }
  };

  const download = () => {
    const blob = new Blob([dashboardToMarkdown(data, sample)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garmin-daten-${data.generatedAt.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-pill" onClick={copy}>
        {status === "copied" ? "Kopiert ✓" : status === "failed" ? "Kopieren nicht möglich" : "Für Claude kopieren"}
      </button>
      <button type="button" className="btn-pill" onClick={download}>
        Als .md speichern
      </button>
      <span className="sr-only" role="status">
        {status === "copied" ? "Daten in die Zwischenablage kopiert" : ""}
      </span>
    </div>
  );
}
