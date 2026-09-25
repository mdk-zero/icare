"use client";

import { useEffect, useState } from "react";

/*
 * The moving parts of the login and contact screens' brand panel. The form
 * card and the gradient behind it are deliberately untouched; everything here
 * layers onto the panel, and all of it stands still
 * under prefers-reduced-motion (CSS via globals.css, the timers via useTicking).
 */

const ACCENT = "#7DD3D8";

function useTicking(ms: number, onTick: () => void) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(onTick, ms);
    return () => window.clearInterval(id);
    // onTick is a state setter wrapper; re-subscribing on each render would reset the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}

/** Cycles the last words of a headline; screen readers get the first one only. */
export function RotatingWords({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  useTicking(interval, () => setIndex((i) => (i + 1) % words.length));

  return (
    <span className="relative inline-block">
      <span className="sr-only">{words[0]}</span>
      <span
        key={index}
        aria-hidden
        className="auth-word inline-block bg-gradient-to-r from-[#7DD3D8] via-white to-[#7DD3D8] bg-[length:200%_100%] bg-clip-text text-transparent"
      >
        {words[index]}
      </span>
    </span>
  );
}

/* One P-QRS-T complex per 100 units on a 40-unit baseline. */
const BEATS = 5;
const BEAT_W = 100;
const ECG_PATH =
  "M0 40 " +
  Array.from({ length: BEATS }, (_, i) => {
    const x = i * BEAT_W;
    return (
      `L${x + 18} 40 Q${x + 24} 33 ${x + 30} 40 ` +
      `L${x + 38} 40 L${x + 41} 46 L${x + 46} 6 L${x + 51} 56 L${x + 55} 40 ` +
      `L${x + 64} 40 Q${x + 73} 27 ${x + 82} 40 L${x + BEAT_W} 40`
    );
  }).join(" ");

/** A lit segment sweeping an unseen lead II trace, at 72 bpm (five beats a pass). */
export function EcgSweep() {
  return (
    <svg
      viewBox={`0 0 ${BEATS * BEAT_W} 60`}
      preserveAspectRatio="none"
      className="opacity-0 animate-fade-in-up mt-10 h-14 w-full overflow-visible"
      style={{ animationDelay: "750ms" }}
      aria-hidden
    >
      <path
        d={ECG_PATH}
        pathLength={1}
        fill="none"
        stroke={ACCENT}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="auth-sweep"
        style={{ animationDuration: "4.2s", filter: `drop-shadow(0 0 5px ${ACCENT})` }}
      />
    </svg>
  );
}
