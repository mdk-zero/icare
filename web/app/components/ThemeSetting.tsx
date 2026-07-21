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
      className="block h-14 w-full overflow-hidden rounded-lg ring-1"
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
        <span className="flex-1 p-1.5">
          <span
            className="mb-1 block h-2.5 w-3/5 rounded-[3px]"
            style={{ backgroundColor: dark ? "#2b7b8c" : "#1b6b7b" }}
          />
          <span
            className="mb-1 block h-1.5 w-full rounded-[3px]"
            style={{ backgroundColor: dark ? "#1f3237" : "#e6edef" }}
          />
          <span
            className="block h-1.5 w-4/5 rounded-[3px]"
            style={{ backgroundColor: dark ? "#1f3237" : "#e6edef" }}
          />
        </span>
      </span>
    </span>
  );
}

export default function ThemeSetting() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  // Rendered on the server as "system"; only trust the DOM after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
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
    <section className="rounded-xl border border-hairline bg-surface shadow-tile p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-gray-900">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose how iCARE++ looks on this device.
          </p>
        </div>
        {mounted && preference === "system" && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
            Now {resolved}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
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
              className={`group relative rounded-xl border p-3 text-left transition-all ${
                selected
                  ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/30"
                  : "border-hairline bg-surface hover:border-brand-300 hover:bg-subtle"
              }`}
            >
              <Preview mode={previewMode} />
              <span className="mt-3 flex items-center gap-2">
                <FontAwesomeIcon
                  icon={option.icon}
                  className={`h-3.5 w-3.5 ${selected ? "text-brand-600" : "text-gray-400"}`}
                />
                <span
                  className={`text-sm font-semibold ${
                    selected ? "text-brand-700" : "text-gray-700"
                  }`}
                >
                  {option.label}
                </span>
                {selected && (
                  <FontAwesomeIcon
                    icon={faCheck}
                    className="ml-auto h-3 w-3 text-brand-600"
                    aria-hidden
                  />
                )}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">{option.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
