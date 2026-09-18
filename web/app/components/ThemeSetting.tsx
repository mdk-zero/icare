"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDesktop, faSun, faMoon, faCheck, faCircleHalfStroke } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";

const options: {
  value: ThemePreference;
  label: string;
  hint: string;
  icon: IconDefinition;
}[] = [
  { value: "system", label: "System", hint: "Follows your device", icon: faDesktop },
  { value: "light", label: "Light", hint: "Always light", icon: faSun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: faMoon },
];

/** Miniature of the app chrome, so each choice is legible before it's applied. */
function Preview({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark";
  return (
    <span
      aria-hidden
      className="block h-16 w-full overflow-hidden rounded-lg"
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

export default function ThemeSetting({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  // Rendered on the server as "system"; only trust the DOM after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage and matchMedia only exist client-side, so the real values
    // can't be read until after mount without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    // The document itself is repainted by the listeners in THEME_INIT_SCRIPT;
    // these only keep this panel's radio and "Now …" label in step with the OS
    // flipping, another tab changing the preference, or another instance of
    // this panel.
    const sync = () => {
      const stored = getStoredTheme();
      setPreference(stored);
      setResolved(resolveTheme(stored));
    };
    sync();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === THEME_STORAGE_KEY) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    setStoredTheme(value);
    setResolved(resolveTheme(value));
  };

  return (
    <section
      className={`animate-rise rounded-2xl border border-hairline bg-surface p-5 shadow-tile ${className}`}
      style={style}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex items-start gap-3 lg:w-64 lg:shrink-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
            <FontAwesomeIcon icon={faCircleHalfStroke} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
              Appearance
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">How iCARE++ looks on this device.</p>
            {mounted && preference === "system" && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
                Showing {resolved} now
              </p>
            )}
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Colour theme"
          className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3"
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
                className={`group rounded-xl border p-2 text-left transition-all ${
                  selected
                    ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/30"
                    : "border-hairline hover:border-brand-300 hover:bg-subtle"
                }`}
              >
                <Preview mode={previewMode} />
                <span className="mt-2 flex items-center gap-2 px-1 pb-0.5">
                  <FontAwesomeIcon
                    icon={option.icon}
                    className={`h-3 w-3 shrink-0 ${selected ? "text-brand-600" : "text-gray-400"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-semibold ${
                        selected ? "text-brand-700" : "text-gray-700"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{option.hint}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      selected ? "bg-brand-600 text-white" : "border border-gray-300"
                    }`}
                  >
                    {selected && <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
