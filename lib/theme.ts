"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const LS_THEME = "nab:theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(LS_THEME);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

/**
 * App-wide theme. The inline script in the root layout applies the saved
 * choice before hydration; this hook keeps `data-theme` in sync afterwards and
 * follows the OS while the preference is "system".
 */
export function useTheme() {
  // Null until the saved choice is read, so the first render never overrides
  // what the pre-hydration script applied.
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    setPreferenceState(readPreference());
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") setResolved(attr);
  }, []);

  useEffect(() => {
    if (!preference) return;
    const apply = () => {
      const next = preference === "system" ? systemTheme() : preference;
      document.documentElement.setAttribute("data-theme", next);
      setResolved(next);
    };
    apply();
    if (preference !== "system") return;
    const media = window.matchMedia(LIGHT_QUERY);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") localStorage.removeItem(LS_THEME);
      else localStorage.setItem(LS_THEME, next);
    } catch {}
  }, []);

  return { preference: preference ?? "system", resolved, setPreference };
}
