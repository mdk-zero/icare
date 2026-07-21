"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDesktop, faSun, faMoon, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  type ThemePreference,
} from "../lib/theme";

const options: {
  value: ThemePreference;
  label: string;
  hint: string;
  icon: IconDefinition;
}[] = [
  { value: "system", label: "System", hint: "Match your device", icon: faDesktop },
  { value: "light", label: "Light", hint: "Always light", icon: faSun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: faMoon },
];

/** Miniature of the app chrome, so each choice is legible before it's applied. */
function Preview({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark";
  return (
    <span
      aria-hidden
      className="block h-9 w-14 shrink-0 overflow-hidden rounded-md"
      style={{
        backgroundColor: dark ? "#0a1214" : "#f5f8f9",
        boxShadow: `inset 0 0 0 1px ${dark ? "#1f3237" : "#e6edef"}`,
      }}
    >
      <span className="flex h-full">
        <span
          className="h-full w-1/4"
          style={{ background: "linear-gradient(180deg,#0b3d3d,#146464)" }}
        />
        <span className="flex-1 p-1">
          <span
            className="mb-[3px] block h-1.5 w-3/5 rounded-[2px]"
            style={{ backgroundColor: dark ? "#2b7b8c" : "#1b6b7b" }}
          />
          <span
            className="mb-[3px] block h-1 w-full rounded-[2px]"
            style={{ backgroundColor: dark ? "#1f3237" : "#e6edef" }}
          />
          <span
            className="block h-1 w-4/5 rounded-[2px]"
            style={{ backgroundColor: dark ? "#1f3237" : "#e6edef" }}
          />
        </span>
      </span>
    </span>
  );
}

export default function ThemeSetting({ className = "" }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  // Rendered on the server as "system"; only trust the DOM after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage and matchMedia only exist client-side, so the real values
    // can't be read until after mount without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = getStoredTheme();
    setPreference(stored);
    setResolved(resolveTheme(stored));
  }, []);

  // Following the OS means reacting when the OS flips.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setResolved(resolveTheme(getStoredTheme()));
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    setStoredTheme(value);
    setResolved(resolveTheme(value));
  };

  return (
    <section
      className={`rounded-xl border border-hairline bg-surface p-4 shadow-tile ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
          Appearance
        </h3>
        {mounted && preference === "system" && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            Now {resolved}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-gray-500">How iCARE++ looks on this device.</p>

      <div role="radiogroup" aria-label="Colour theme" className="mt-3 space-y-2">
        {options.map((option) => {
          const selected = mounted && preference === option.value;
          const previewMode: "light" | "dark" =
            option.value === "system" ? resolved : option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all ${
                selected
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/30"
                  : "border-hairline hover:border-brand-300 hover:bg-subtle"
              }`}
            >
              <Preview mode={previewMode} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <FontAwesomeIcon
                    icon={option.icon}
                    className={`h-3 w-3 shrink-0 ${
                      selected ? "text-brand-600" : "text-gray-400"
                    }`}
                  />
                  <span
                    className={`truncate text-sm font-semibold ${
                      selected ? "text-brand-700" : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">
                  {option.hint}
                </span>
              </span>
              {selected && (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="h-3 w-3 shrink-0 text-brand-600"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
