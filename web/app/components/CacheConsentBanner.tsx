"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faXmark } from "@fortawesome/free-solid-svg-icons";
import { getCacheConsent, setCacheConsent } from "../lib/cache-consent";

/**
 * Asked once per browser, the first time `getCacheConsent()` comes back
 * `null`. Answering either way — including the dismiss button, treated the
 * same as "Not now" — records a choice, so this never asks twice; the choice
 * can still be changed later from `LocalCacheSetting` in account settings.
 */
export default function CacheConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(getCacheConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (granted: boolean) => {
    setCacheConsent(granted ? "granted" : "declined");
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Local caching consent"
      className="animate-rise fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-hairline bg-surface p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:left-auto sm:right-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
        <FontAwesomeIcon icon={faBolt} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Save data on this device?</p>
        <p className="mt-0.5 text-sm text-gray-500">
          Pages you've already opened will load instantly next time instead of
          waiting on the network. Nothing leaves your device, and you can turn
          it off anytime in settings.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => choose(true)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Yes, speed it up
          </button>
          <button
            onClick={() => choose(false)}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-subtle"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={() => choose(false)}
        aria-label="Dismiss"
        className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
