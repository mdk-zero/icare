"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import {
  CACHE_CONSENT_CHANGE_EVENT,
  CACHE_CONSENT_STORAGE_KEY,
  getCacheConsent,
  setCacheConsent,
} from "../lib/cache-consent";

export default function LocalCacheSetting({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [granted, setGranted] = useState(false);
  // Rendered on the server as off; only trust localStorage after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    const sync = () => setGranted(getCacheConsent() === "granted");
    sync();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === CACHE_CONSENT_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CACHE_CONSENT_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CACHE_CONSENT_CHANGE_EVENT, sync);
    };
  }, []);

  const toggle = () => {
    const next = !granted;
    setGranted(next);
    setCacheConsent(next ? "granted" : "declined");
  };

  return (
    <section
      className={`animate-rise rounded-2xl border border-hairline bg-surface p-5 shadow-tile ${className}`}
      style={style}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
          <FontAwesomeIcon icon={faBolt} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
              Local caching
            </h3>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                checked={mounted && granted}
                onChange={toggle}
                className="peer sr-only"
                aria-label="Save data locally for faster loading"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-surface after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-brand-600/50" />
            </label>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            Keep a copy of what you've loaded on this device, so pages you've
            already opened come back instantly instead of waiting on the
            network — until it's five minutes old.
          </p>
          {mounted && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
              {granted ? "Saving to this device" : "Off — nothing saved"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
