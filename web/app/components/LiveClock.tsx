"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";

type Now = { hh: string; mm: string; ss: string; period: "AM" | "PM"; date: string };

function readNow(): Now {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = now.getHours();
  return {
    // 0 → 12 AM, 12 → 12 PM. Hours stay padded so the readout keeps a fixed
    // width and the header never reflows as the minutes turn over.
    hh: pad(hours % 12 || 12),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    period: hours < 12 ? "AM" : "PM",
    date: now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  };
}

/**
 * Wall clock for page headers: the time in large monospaced digits (so the
 * readout never jitters as the seconds tick) under a small date line, the way
 * a ward's monitor shows it.
 *
 * - `full` — date line over large digits; the header's right-hand readout.
 * - `compact` — one line, for slim header rows and phones.
 * - `auto` — compact on phones, full from `sm` up.
 *
 * The time is absent from the server render and fills in on mount; rendering
 * it on the server would mismatch on every load. Placeholders keep the width.
 */
export default function LiveClock({
  variant = "auto",
  className = "",
  style,
}: {
  variant?: "auto" | "full" | "compact";
  className?: string;
  style?: CSSProperties;
}) {
  const [now, setNow] = useState<Now | null>(null);

  useEffect(() => {
    // Show the real time immediately, then tick. Each tick re-reads the clock,
    // so a throttled/slow interval never accumulates drift.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(readNow());
    const id = setInterval(() => setNow(readNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = now?.hh ?? "--";
  const mm = now?.mm ?? "--";
  const ss = now?.ss ?? "--";
  const period = now?.period ?? "--";
  const label = now ? `Current time ${hh}:${mm} ${period}, ${now.date}` : "Current time";

  const compact = (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-sm font-semibold leading-none text-slate-700"
      role="img"
      aria-label={label}
    >
      <FontAwesomeIcon icon={faClock} aria-hidden className="h-3.5 w-3.5 text-brand-600" />
      <span aria-hidden className="tabular-nums">
        {hh}:{mm}
        <span className="text-slate-400">:{ss}</span>
        <span className="ml-1 text-[11px] font-medium text-slate-500">{period}</span>
      </span>
      {now && (
        <span aria-hidden className="font-sans text-xs font-medium text-slate-400">
          · {now.date}
        </span>
      )}
    </span>
  );

  const full = (
    <div className="text-right" role="img" aria-label={label}>
      <p
        aria-hidden
        className="flex items-center justify-end gap-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.2em] text-slate-400"
      >
        <FontAwesomeIcon icon={faClock} className="h-3 w-3 text-brand-600" />
        {now?.date ?? " "}
      </p>
      <p
        aria-hidden
        className="mt-2 whitespace-nowrap font-mono text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-900"
      >
        {hh}:{mm}
        <span className="text-slate-400">:{ss}</span>
        <span className="ml-2 align-top font-mono text-xs font-semibold tracking-[0.08em] text-brand-600">
          {period}
        </span>
      </p>
    </div>
  );

  if (variant === "compact") {
    return (
      <span className={className} style={style}>
        {compact}
      </span>
    );
  }
  if (variant === "full") {
    return (
      <div className={className} style={style}>
        {full}
      </div>
    );
  }
  return (
    <div className={className} style={style}>
      <span className="sm:hidden">{compact}</span>
      <div className="hidden sm:block">{full}</div>
    </div>
  );
}
