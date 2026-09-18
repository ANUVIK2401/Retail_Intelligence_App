"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const STORAGE_KEY = "ecc-theme";

export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function chooseTheme(value: Theme) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage can be disabled in private contexts; the current choice still works.
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs font-medium">
      <span className="muted">Theme</span>
      <select
        aria-label="Color theme"
        className="tap rounded-lg border px-3 text-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        value={theme}
        onChange={(event) => chooseTheme(event.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
