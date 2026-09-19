"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const STORAGE_KEY = "ecc-theme";

const OPTIONS: { value: Theme; label: string; icon: () => React.JSX.Element }[] = [
  { value: "system", label: "System", icon: SystemGlyph },
  { value: "light", label: "Light", icon: SunGlyph },
  { value: "dark", label: "Dark", icon: MoonGlyph },
];

/**
 * Segmented control, the way macOS and iOS present a three-way mode choice.
 * The selected pill is a moving layer behind the labels rather than a restyled
 * button, so the transition is one slide instead of two colour fades.
 */
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

  const index = OPTIONS.findIndex((option) => option.value === theme);

  return (
    <div className="segmented" role="radiogroup" aria-label="Color theme">
      <span
        className="segmented-thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            className="segmented-option"
            data-selected={selected ? "true" : undefined}
            onClick={() => chooseTheme(option.value)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

function SystemGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7" />
    </svg>
  );
}
function SunGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </svg>
  );
}
function MoonGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.3 8.3 0 1 0 20 14.5z" />
    </svg>
  );
}
