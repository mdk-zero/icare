"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartLine,
  faCircleCheck,
  faClock,
  faMinus,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { FacultyOverview } from "../../lib/api";
import { plural } from "./format";

type Section = FacultyOverview["sections"][number];

/** A change smaller than this reads as steady rather than a movement. */
const STEADY_POINTS = 0.5;

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One section as a bedside monitor strip: its quiz average over the last two
 * weeks as the headline, the change from the two weeks before, and eight weeks
 * of trace on chart paper ending in a live dot on the current week.
 *
 * Every monitor on the page shares `domain`, so two traces at the same height
 * mean the same score — small multiples, not eight independent zooms.
 */
export default function SectionMonitor({
  section,
  domain,
  style,
}: {
  section: Section;
  domain: { min: number; max: number };
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = section.weekly;
  const n = points.length;
  const span = Math.max(1, domain.max - domain.min);
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - ((v - domain.min) / span) * 100;

  // Break the line at a week with no attempts rather than bridging it.
  const runs: { i: number; v: number }[][] = [];
  points.forEach((p, i) => {
    if (p.average == null) return;
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === i - 1) run.push({ i, v: p.average });
    else runs.push([{ i, v: p.average }]);
  });
  const path = (run: { i: number; v: number }[]) =>
    run.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");

  const lastIndex = n - 1;
  const last = points[lastIndex]?.average ?? null;
  const prevIndex = lastIndex - 1;
  const prev = points[prevIndex]?.average ?? null;
  const hasTrace = runs.length > 0;

  const delta =
    section.avg_recent != null && section.avg_prior != null
      ? Math.round((section.avg_recent - section.avg_prior) * 10) / 10
      : null;
  const trend =
    delta == null
      ? null
      : Math.abs(delta) < STEADY_POINTS
        ? { icon: faMinus, text: "Steady", tone: "text-slate-500 bg-slate-100" }
        : delta > 0
          ? { icon: faArrowTrendUp, text: `+${delta.toFixed(1)} vs prior`, tone: "text-emerald-700 bg-emerald-50" }
          : { icon: faArrowTrendDown, text: `\u2212${Math.abs(delta).toFixed(1)} vs prior`, tone: "text-rose-700 bg-rose-50" };

  const hovered = hover != null ? points[hover] : null;

  return (
    <article
      className="animate-rise group/monitor flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile transition-shadow duration-200 hover:shadow-tile-hover"
      style={style}
      aria-label={`${section.name} section monitor`}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
            {section.name}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
            {plural(section.students, "student")}
          </span>
          <Link
            href="/faculty/analytics"
            aria-label={`Open ${section.name} in analytics`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-brand-600/10 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <FontAwesomeIcon icon={faChartLine} className="h-3 w-3" />
          </Link>
        </span>
      </header>

      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-baseline gap-0.5 font-display leading-none tracking-[-0.03em] text-slate-900">
            <span className="text-[34px] font-semibold">
              {section.avg_recent != null ? Math.round(section.avg_recent) : "—"}
            </span>
            {section.avg_recent != null && <span className="text-lg font-medium text-slate-400">%</span>}
          </p>
          {trend && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${trend.tone}`}
              title="Change in points from the two weeks before"
            >
              <FontAwesomeIcon icon={trend.icon} className="h-3 w-3" />
              {trend.text}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500">Skill Assessment average, last 2 weeks</p>
      </div>

      {/* The trace. Stretched to the tile with non-scaling strokes, so it is
          drawn at whatever width the grid gives it; the dots are HTML laid
          over it by percentage, which keeps them round at any aspect. */}
      <div className="px-4 pt-3">
        <div
          className="relative h-16 rounded-md bg-[linear-gradient(to_right,var(--color-hairline)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-hairline)_1px,transparent_1px)] bg-[size:12px_12px]"
          onPointerMove={(e) => {
            if (!hasTrace) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            setHover(Math.round(ratio * (n - 1)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {hasTrace ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              {runs.map((run, k) => (
                <path
                  key={k}
                  d={path(run)}
                  fill="none"
                  stroke="var(--color-brand-300)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* The current week, in the accent. */}
              {last != null && prev != null && (
                <path
                  d={`M${x(prevIndex)},${y(prev)} L${x(lastIndex)},${y(last)}`}
                  fill="none"
                  stroke="var(--color-brand-600)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
              No skill assessment attempts in 8 weeks
            </p>
          )}

          {last != null && (
            <span
              aria-hidden
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x(lastIndex)}%`, top: `${y(last)}%` }}
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/60" />
              <span className="absolute inset-0 rounded-full bg-brand-600 ring-2 ring-surface" />
            </span>
          )}

          {hovered && hover != null && hovered.average != null && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-slate-300"
                style={{ left: `${x(hover)}%` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 ring-2 ring-surface"
                style={{ left: `${x(hover)}%`, top: `${y(hovered.average)}%` }}
              />
              <span
                className="pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-md border border-hairline bg-surface px-2 py-1 text-[11px] shadow-tile"
                style={{
                  left: `${x(hover)}%`,
                  transform: `translate(${hover === 0 ? "0" : hover === lastIndex ? "-100%" : "-50%"}, -100%)`,
                }}
              >
                <span className="font-semibold text-slate-900">{Math.round(hovered.average)}%</span>{" "}
                <span className="text-slate-500">wk of {weekLabel(hovered.week_start)}</span>
              </span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-slate-400">
          <span>8 wks ago</span>
          <span>This wk</span>
        </div>
        {/* The hover readout, reachable without a pointer. */}
        <ul className="sr-only">
          {points.map((p) => (
            <li key={p.week_start}>
              Week of {weekLabel(p.week_start)}: {p.average != null ? `${Math.round(p.average)}%` : "no attempts"}
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-3.5 grid grid-cols-3 divide-x divide-hairline border-t border-hairline">
        <Metric
          icon={faTriangleExclamation}
          tone={section.at_risk > 0 ? "text-red-600" : "text-slate-300"}
          value={section.at_risk}
          label="At risk"
        />
        <Metric
          icon={faClock}
          tone={section.overdue > 0 ? "text-amber-600" : "text-slate-300"}
          value={section.overdue}
          label="Overdue"
        />
        <Metric
          icon={faCircleCheck}
          tone="text-emerald-600"
          value={section.completion != null ? `${section.completion}%` : "—"}
          label="Handed in"
        />
      </footer>
    </article>
  );
}

function Metric({
  icon,
  tone,
  value,
  label,
}: {
  icon: typeof faClock;
  tone: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-2.5">
      <span className="flex items-center gap-1.5">
        <FontAwesomeIcon icon={icon} className={`h-3 w-3 ${tone}`} />
        <span className="text-[13px] font-semibold text-slate-900">{value}</span>
      </span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-slate-400">{label}</span>
    </div>
  );
}
