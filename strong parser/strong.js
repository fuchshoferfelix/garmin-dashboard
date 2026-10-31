var Strong = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // strong.ts
  var strong_exports = {};
  __export(strong_exports, {
    MUSCLES: () => MUSCLES,
    MUSCLE_LABEL: () => MUSCLE_LABEL,
    muscleLoad: () => muscleLoad,
    musclesFor: () => musclesFor,
    e1rm: () => e1rm,
    e1rmTrend: () => e1rmTrend,
    formatForAI: () => formatForAI,
    isWorkingSet: () => isWorkingSet,
    parseStrongCsv: () => parseStrongCsv,
    recentPRs: () => recentPRs,
    topExercises: () => topExercises,
    weeklyVolume: () => weeklyVolume
  });
  function detectDelimiter(headerLine) {
    return (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  }
  function splitLine(line, delim) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (c === delim && !inQuotes) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  function parseStrongCsv(csv) {
    const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const delim = detectDelimiter(lines[0]);
    const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());
    const col = (...names) => header.findIndex((h) => names.includes(h));
    const iDate = col("date", "datum"), iWorkout = col("workout name", "workout-name");
    const iEx = col("exercise name", "name der \xFCbung");
    const iSet = col("set order", "reihenfolge festlegen"), iW = col("weight", "gewicht");
    const iReps = col("reps", "wiederh."), iRpe = col("rpe");
    const num = (s) => {
      const n = parseFloat((s ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    return lines.slice(1).map((line) => {
      const c = splitLine(line, delim);
      return {
        date: new Date(c[iDate].replace(" ", "T")),
        workout: c[iWorkout] ?? "",
        exercise: c[iEx] ?? "",
        setOrder: c[iSet] ?? "",
        weight: num(c[iW]),
        reps: num(c[iReps]),
        rpe: iRpe >= 0 && c[iRpe] ? num(c[iRpe]) : null
      };
    }).filter((s) => s.exercise && !isNaN(s.date.getTime()));
  }
  var isWorkingSet = (s) => s.setOrder !== "W" && s.reps > 0;
  var e1rm = (weight, reps) => reps === 1 ? weight : weight * (1 + reps / 30);
  function weekKey(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  function weeklyVolume(sets) {
    const map = /* @__PURE__ */ new Map();
    for (const s of sets.filter(isWorkingSet)) {
      const k = weekKey(s.date);
      const e = map.get(k) ?? { week: k, volume: 0, hardSets: 0 };
      e.volume += s.weight * s.reps;
      e.hardSets += 1;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
  }
  function e1rmTrend(sets, exercise) {
    const map = /* @__PURE__ */ new Map();
    for (const s of sets.filter((x) => x.exercise === exercise && isWorkingSet(x))) {
      const day = s.date.toISOString().slice(0, 10);
      map.set(day, Math.max(map.get(day) ?? 0, e1rm(s.weight, s.reps)));
    }
    return [...map.entries()].map(([date, value]) => ({ date, e1rm: Math.round(value * 10) / 10 })).sort((a, b) => a.date.localeCompare(b.date));
  }
  function topExercises(sets, limit = 8) {
    const count = /* @__PURE__ */ new Map();
    for (const s of sets.filter(isWorkingSet)) count.set(s.exercise, (count.get(s.exercise) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
  }
  function recentPRs(sets, days = 30) {
    const cutoff = Date.now() - days * 864e5;
    const best = /* @__PURE__ */ new Map();
    const prs = [];
    for (const s of [...sets].filter(isWorkingSet).sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const v = e1rm(s.weight, s.reps);
      if (v > (best.get(s.exercise) ?? 0)) {
        best.set(s.exercise, v);
        if (s.date.getTime() >= cutoff)
          prs.push({ exercise: s.exercise, date: s.date.toISOString().slice(0, 10), weight: s.weight, reps: s.reps, e1rm: Math.round(v * 10) / 10 });
      }
    }
    return prs.reverse();
  }
  var pad = (n) => String(n).padStart(2, "0");
  var localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  var fmt = (n) => String(Math.round(n * 100) / 100);
  function formatForAI(all, o) {
    if (!all.length) return "";
    const last = Math.max(...all.map((s) => s.date.getTime()));
    const cutoff = o.days == null ? -Infinity : last - o.days * 864e5;
    const sets = all.filter((s) => s.date.getTime() >= cutoff && (o.warmups || s.setOrder !== "W")).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!sets.length) return "";
    const workouts = /* @__PURE__ */ new Map();
    for (const s of sets) {
      const k = `${s.date.getTime()}|${s.workout}`;
      workouts.set(k, [...workouts.get(k) ?? [], s]);
    }
    const out = [];
    out.push("# Strong Trainingsdaten");
    out.push(
      `Zeitraum: ${localDay(sets[0].date)} bis ${localDay(sets[sets.length - 1].date)} \xB7 ${workouts.size} Workouts \xB7 ${sets.length} S\xE4tze \xB7 Einheit: kg`
    );
    out.push("Satzformat: Gewicht x Wdh [@RPE]. W = Warm-up, D = Drop-Set, F = Failure, BW = K\xF6rpergewicht/0 kg. e1RM nach Epley.");
    if (o.summary) {
      const working = sets.filter(isWorkingSet);
      out.push("", "## Wochenvolumen (ohne Warm-ups, Gewicht \xD7 Wdh.)");
      for (const w of weeklyVolume(working).slice(-52))
        out.push(`- ${w.week}: ${Math.round(w.volume)} kg, ${w.hardSets} S\xE4tze`);
      out.push("", "## Top-\xDCbungen (e1RM-Entwicklung)");
      for (const ex of topExercises(working, 8)) {
        const t = e1rmTrend(working, ex);
        if (!t.length) continue;
        const best = Math.max(...t.map((p) => p.e1rm));
        const recent = t.slice(-8).map((p) => `${p.date.slice(5)}: ${p.e1rm}`).join(", ");
        out.push(`- ${ex} \u2014 ${t.length} Einheiten, erster e1RM ${t[0].e1rm}, Bestwert ${best}, zuletzt: ${recent}`);
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
        const byEx = /* @__PURE__ */ new Map();
        for (const s of group) byEx.set(s.exercise, [...byEx.get(s.exercise) ?? [], s]);
        for (const [ex, list] of byEx) {
          const txt = list.map((s) => {
            const prefix = /^[WDF]$/.test(s.setOrder) ? `${s.setOrder} ` : "";
            return `${prefix}${s.weight ? fmt(s.weight) : "BW"}x${fmt(s.reps)}${s.rpe != null ? `@${fmt(s.rpe)}` : ""}`;
          }).join(", ");
          out.push(`- ${ex}: ${txt}`);
        }
      }
    }
    return out.join("\n");
  }
  var MUSCLES = [
    "chest", "shoulders", "rearDelts", "traps", "lats", "lowerBack",
    "biceps", "triceps", "forearms", "abs", "obliques",
    "glutes", "quads", "hamstrings", "adductors", "calves"
  ];
  var MUSCLE_LABEL = {
    chest: "Brust", shoulders: "Schultern", rearDelts: "Hintere Schulter", traps: "Trapez",
    lats: "Latissimus", lowerBack: "Unterer R\xFCcken", biceps: "Bizeps", triceps: "Trizeps",
    forearms: "Unterarme", abs: "Bauch", obliques: "Seitlicher Bauch", glutes: "Ges\xE4\xDF",
    quads: "Quadrizeps", hamstrings: "Beinbeuger", adductors: "Adduktoren", calves: "Waden"
  };
  var RULES = [
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
    [/back extension|hyperextension/, ["lowerBack"], ["glutes", "hamstrings"]]
  ];
  function musclesFor(exercise) {
    const name = exercise.toLowerCase();
    for (const [re, primary, secondary] of RULES) if (re.test(name)) return { primary, secondary };
    return null;
  }
  function muscleLoad(all, days) {
    const working = all.filter(isWorkingSet);
    const last = Math.max(...all.map((s) => s.date.getTime()));
    const first = Math.min(...all.map((s) => s.date.getTime()));
    const cutoff = days == null ? -Infinity : last - days * 864e5;
    const spanWeeks = (last - first) / (7 * 864e5);
    const weeks = Math.max(1, days == null ? spanWeeks : Math.min(days / 7, spanWeeks));
    const acc = Object.fromEntries(MUSCLES.map((m) => [m, /* @__PURE__ */ new Map()]));
    const unmapped = /* @__PURE__ */ new Set();
    for (const s of working) {
      if (s.date.getTime() < cutoff) continue;
      const hit = musclesFor(s.exercise);
      if (!hit) {
        unmapped.add(s.exercise);
        continue;
      }
      for (const m of hit.primary) acc[m].set(s.exercise, (acc[m].get(s.exercise) ?? 0) + 1);
      for (const m of hit.secondary) acc[m].set(s.exercise, (acc[m].get(s.exercise) ?? 0) + 0.5);
    }
    const muscles = Object.fromEntries(MUSCLES.map((m) => {
      const entries = [...acc[m].entries()].sort((a, b) => b[1] - a[1]);
      const sets = entries.reduce((n, [, v]) => n + v, 0);
      return [m, { sets, perWeek: sets / weeks, top: entries.slice(0, 4).map(([exercise, sets2]) => ({ exercise, sets: sets2 })) }];
    }));
    return { weeks, muscles, unmapped: [...unmapped] };
  }
  return __toCommonJS(strong_exports);
})();
