"use client";

import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
const getSnapshot = () => document.documentElement.dataset.theme ?? "dark";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "dark");
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn-pill"
      aria-label={next === "light" ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln"}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          // storage unavailable: the choice just won't persist
        }
      }}
    >
      {next === "light" ? "Hell" : "Dunkel"}
    </button>
  );
}
