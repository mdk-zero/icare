"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faXmark } from "@fortawesome/free-solid-svg-icons";

/** This tab's build (next.config.ts); empty off Vercel, which turns the check off. */
const BUILD_ID = process.env.ICARE_BUILD_ID || "";

/** How often an open, visible tab asks which build is live. */
const CHECK_EVERY_MS = 5 * 60_000;
/** Focus and tab switches ask too, but not more than this often. */
const MIN_GAP_MS = 60_000;
/** The build this tab was told about and waved off, so it doesn't come back until the next one. */
const DISMISSED_KEY = "icare_update_dismissed";

function dismissedBuild(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * A small note at the bottom of every page once a newer build of the site is
 * live: this tab is still running the old code, and a refresh picks up the
 * new one. It never reloads on its own, so nothing being typed is lost.
 *
 * Checks /api/version when the tab comes back into view or regains focus,
 * and every few minutes while it's open.
 */
export default function UpdateToast() {
  const [latest, setLatest] = useState<string | null>(null);
  const found = useRef(false);

  useEffect(() => {
    if (!BUILD_ID) return;
    let last = 0;
    let stopped = false;

    const check = async () => {
      if (found.current || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      try {
        // Plain fetch: api.ts would count every check in the request telemetry.
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: unknown };
        if (stopped || typeof version !== "string" || !version || version === BUILD_ID) return;
        if (dismissedBuild() === version) return;
        found.current = true;
        setLatest(version);
      } catch {
        // Offline or mid-deploy; the next check tries again.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  if (!latest) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      // Without storage it can come back on the next check, which is fine.
    }
    // Keep checking: this build stays waved off, but a later one still shows.
    found.current = false;
    setLatest(null);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-full animate-rise items-center gap-2.5 rounded-full border border-hairline bg-surface py-1.5 pl-4 pr-1.5 text-sm text-gray-700 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      >
        <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0">A new version is available.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 cursor-pointer rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 focus-visible:ring-offset-1"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
