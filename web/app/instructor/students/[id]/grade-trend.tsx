"use client";

import { useMemo, useState } from "react";

/** The passing mark, as on the rest of the portal. */
const PASSING = 75;
/** How far ahead the projection reaches, in days. */
const HORIZON_DAYS = 30;
/** The trend is fitted to the most recent grades only, so an old slump doesn't steer it. */
const RECENT = 12;
const DAY = 86_400_000;

export type GradePoint = { at: string; grade: number; label: string };

const W = 320;
const H = 150;
const PAD = { left: 30, right: 12, top: 12, bottom: 22 };

const shortDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Least squares through (x, y): the line's value at 0 and its slope. */
function fit(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

/**
 * Where the student is heading: their graded quizzes and patient cases over
 * time, and a dashed line carrying the recent trend (a straight-line fit to
 * their latest grades) a month ahead, against the passing mark. It reads the
 * pace they are on, nothing more; the Thriving / At risk label above comes
 * from the prediction model.
 */
export default function GradeTrend({ points }: { points: GradePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const sorted = points
      .map((p) => ({ ...p, t: Date.parse(p.at) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.grade))
      .sort((a, b) => a.t - b.t);
    const days = new Set(sorted.map((p) => Math.floor(p.t / DAY)));
    if (sorted.length < 3 || days.size < 2) return { sorted, trend: null };

    const recent = sorted.slice(-RECENT);
    const t0 = recent[0].t;
    const { a, b } = fit(
      recent.map((p) => (p.t - t0) / DAY),
      recent.map((p) => p.grade),
    );
    const last = sorted[sorted.length - 1].t;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const at = (t: number) => clamp(a + b * ((t - t0) / DAY));
    const end = last + HORIZON_DAYS * DAY;
    return { sorted, trend: { from: recent[0].t, last, end, at, perWeek: b * 7 } };
  }, [points]);

  const { sorted, trend } = model;
  if (sorted.length === 0) return null;

  const tMin = sorted[0].t;
  const tMax = trend ? trend.end : sorted[sorted.length - 1].t;
  const span = Math.max(DAY, tMax - tMin);
  const x = (t: number) => PAD.left + ((t - tMin) / span) * (W - PAD.left - PAD.right);
  const y = (g: number) => PAD.top + (1 - g / 100) * (H - PAD.top - PAD.bottom);

  const line = sorted.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.grade).toFixed(1)}`).join(" ");
  const projected = trend ? Math.round(trend.at(trend.end)) : null;
  const pace =
    !trend ? null : trend.perWeek > 1 ? "rising" : trend.perWeek < -1 ? "falling" : "holding steady";
  const shown = hover !== null ? sorted[hover] : null;

  return (
    <div className="border-t border-hairline pt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-sm text-gray-500">Where they&apos;re heading</p>
        {shown ? (
          <p className="text-xs text-gray-600 tabular-nums">
            {shortDay(shown.t)} · <span className="font-semibold text-gray-900">{Math.round(shown.grade)}%</span>
          </p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={
          trend
            ? `Grades from ${shortDay(tMin)}, ${pace}; about ${projected}% by ${shortDay(trend.end)} if this pace continues. Passing is ${PASSING}%.`
            : `Grades so far: ${sorted.map((p) => `${Math.round(p.grade)}%`).join(", ")}.`
        }
        onMouseLeave={() => setHover(null)}
      >
        {/* Recessive grid: 0, 50 and 100, plus the passing mark, labelled. */}
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} className="stroke-gray-100" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(g) + 3} textAnchor="end" className="fill-gray-400 text-[9px]">
              {g}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(PASSING)}
          y2={y(PASSING)}
          className="stroke-gray-400"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <text x={W - PAD.right} y={y(PASSING) - 4} textAnchor="end" className="fill-gray-500 text-[9px]">
          Passing {PASSING}%
        </text>

        {/* The month ahead, shaded so it reads as a projection, not a record. */}
        {trend && (
          <>
            <rect
              x={x(trend.last)}
              y={PAD.top}
              width={x(trend.end) - x(trend.last)}
              height={H - PAD.top - PAD.bottom}
              className="fill-gray-50"
            />
            <line
              x1={x(trend.from)}
              y1={y(trend.at(trend.from))}
              x2={x(trend.end)}
              y2={y(trend.at(trend.end))}
              className="stroke-brand-600"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              opacity={0.75}
            />
            <circle cx={x(trend.end)} cy={y(trend.at(trend.end))} r={4} className="fill-surface stroke-brand-600" strokeWidth={2} />
          </>
        )}

        <path d={line} fill="none" className="stroke-brand-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {sorted.map((p, i) => (
          <g key={`${p.t}-${i}`}>
            <circle
              cx={x(p.t)}
              cy={y(p.grade)}
              r={hover === i ? 5 : 3.5}
              className="fill-brand-600 stroke-surface"
              strokeWidth={2}
            />
            {/* A hit target bigger than the dot. */}
            <circle cx={x(p.t)} cy={y(p.grade)} r={10} fill="transparent" onMouseEnter={() => setHover(i)}>
              <title>{`${p.label}: ${Math.round(p.grade)}% on ${shortDay(p.t)}`}</title>
            </circle>
          </g>
        ))}

        <text x={PAD.left} y={H - 6} className="fill-gray-400 text-[9px]">
          {shortDay(tMin)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-gray-400 text-[9px]">
          {shortDay(tMax)}
        </text>
      </svg>

      <p className="mt-1 text-xs text-gray-600">
        {trend ? (
          <>
            Grades are {pace}. If this pace continues, about{" "}
            <span className={`font-semibold ${projected! >= PASSING ? "text-emerald-700" : "text-red-700"}`}>
              {projected}% by {shortDay(trend.end)}
            </span>
            {projected! >= PASSING ? ", above passing." : ", below passing."}
          </>
        ) : (
          "Needs at least three graded quizzes or patient cases, on different days, to project a trend."
        )}
      </p>
    </div>
  );
}
