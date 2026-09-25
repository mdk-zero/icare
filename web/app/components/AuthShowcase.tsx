"use client";

import { useEffect, useState } from "react";

/*
 * The moving parts of the login and contact screens' brand panel. The form
 * card and the gradient behind it are deliberately untouched; everything here
 * layers onto the panel, and all of it stands still
 * under prefers-reduced-motion (CSS via globals.css, the timers via useTicking).
 */

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
