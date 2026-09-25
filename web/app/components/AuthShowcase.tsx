"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart } from "@fortawesome/free-solid-svg-icons";

/*
 * The moving parts of the login and contact screens' brand panel. The form
 * card and the gradient behind it are deliberately untouched; everything here
 * layers onto the panel as a bedside monitor would, and all of it stands still
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

function Vital({
  label,
  value,
  unit,
  tone = "text-white",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className={`mt-1 flex items-baseline gap-1 font-mono tabular ${tone}`}>
        <span key={value} className="auth-digit text-xl font-semibold leading-none">
          {value}
        </span>
        <span className="text-[10px] text-white/40">{unit}</span>
      </p>
    </div>
  );
}

/** A small glass bedside monitor: a sweeping lead II trace and drifting vitals. */
export function VitalsMonitor() {
  const [vitals, setVitals] = useState({ hr: 72, spo2: 98, sys: 118, dia: 76 });
  useTicking(2400, () =>
    setVitals((v) => {
      const drift = (value: number, lo: number, hi: number, step: number) =>
        Math.min(hi, Math.max(lo, value + Math.round((Math.random() * 2 - 1) * step)));
      return {
        hr: drift(v.hr, 68, 78, 2),
        spo2: drift(v.spo2, 97, 99, 1),
        sys: drift(v.sys, 114, 124, 2),
        dia: drift(v.dia, 72, 80, 1),
      };
    }),
  );

  // One sweep per five beats, so the trace keeps pace with the displayed rate.
  const sweepSeconds = ((60 / vitals.hr) * BEATS).toFixed(2);

  return (
    <div
      className="opacity-0 animate-fade-in-up relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md [@media(max-height:860px)]:hidden"
      style={{ animationDelay: "750ms" }}
      aria-hidden
    >
      {/* Scanline sheen crossing the screen glass. */}
      <div className="auth-scan pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />

      <div className="mb-2 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
        <span className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live · Lead II
        </span>
        <span>Sim patient · Bed 04</span>
      </div>

      <svg viewBox={`0 0 ${BEATS * BEAT_W} 60`} preserveAspectRatio="none" className="h-12 w-full">
        <path
          d={ECG_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
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
          style={{
            animationDuration: `${sweepSeconds}s`,
            filter: `drop-shadow(0 0 5px ${ACCENT})`,
          }}
        />
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
        <div className="flex items-end gap-2">
          <Vital label="HR" value={String(vitals.hr)} unit="bpm" tone="text-[#7DD3D8]" />
          <FontAwesomeIcon
            icon={faHeart}
            className="auth-heartbeat mb-0.5 h-3 w-3 text-rose-400"
            style={{ animationDuration: `${(60 / vitals.hr).toFixed(2)}s` }}
          />
        </div>
        <Vital label="SpO₂" value={String(vitals.spo2)} unit="%" tone="text-emerald-300" />
        <Vital label="NIBP" value={`${vitals.sys}/${vitals.dia}`} unit="mmHg" />
      </div>
    </div>
  );
}
