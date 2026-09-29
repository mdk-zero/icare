"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AnalyticsBucket, AnalyticsSummary, Section } from "../../lib/api";
import { TARGET_SCORE } from "../../lib/performance-target";
import { formatBucket } from "./dates";

/*
 * "Classroom Performance Overview": average quiz score per period, one bar per
 * section in each period's cluster. Each section keeps one colour for good — its position among the
 * sections this faculty member manages picks a slot in the fixed series
 * palette (globals.css) — so narrowing the section filter never repaints the
 * bars that remain.
 */

type Point = { week_start: string; average_score: number };

export interface TrendSeries {
  id: string;
  name: string;
  color: string;
  points: Point[];
}

const SLOTS = 8;
const slotColor = (slot: number) => `var(--color-series-${slot + 1})`;
/** Folded sections are not an entity of their own, so they get no hue. */
const OTHER_COLOR = "var(--color-gray-400)";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * One series per section in the summary's `section_trend` — never a merged
 * all-sections series. Past eight sections, the ninth onward fold into one
 * attempt-weighted "Other sections" series rather than cycling a hue.
 */
export function buildTrendSeries(
  summary: AnalyticsSummary | null,
  managed: Section[],
): TrendSeries[] {
  const rows = summary?.section_trend ?? [];
  const names = new Map<string, string>();
  for (const s of managed) names.set(s.id, s.name);
  for (const r of rows) if (!names.has(r.section_id)) names.set(r.section_id, r.section_name);

  // Slots follow every managed section, not just the ones in view.
  const order = [...names.entries()].sort((a, b) => byName(a[1], b[1])).map(([id]) => id);
  const fold = order.length > SLOTS;
  const ownSlots = fold ? SLOTS - 1 : SLOTS;
  const slotOf = new Map(order.map((id, i) => [id, i]));

  const own = new Map<string, Point[]>();
  const other = new Map<string, { weighted: number; attempts: number }>();
  for (const r of rows) {
    const slot = slotOf.get(r.section_id) ?? order.length;
    if (slot < ownSlots) {
      const points = own.get(r.section_id) ?? [];
      points.push({ week_start: r.week_start, average_score: r.average_score });
      own.set(r.section_id, points);
    } else {
      const acc = other.get(r.week_start) ?? { weighted: 0, attempts: 0 };
      acc.weighted += r.average_score * r.attempts;
      acc.attempts += r.attempts;
      other.set(r.week_start, acc);
    }
  }

  const series: TrendSeries[] = [...own.entries()]
    .sort((a, b) => slotOf.get(a[0])! - slotOf.get(b[0])!)
    .map(([id, points]) => ({
      id,
      name: names.get(id) ?? "Section",
      color: slotColor(slotOf.get(id)!),
      points: points.sort((a, b) => a.week_start.localeCompare(b.week_start)),
    }));
  if (other.size > 0) {
    series.push({
      id: "other",
      name: "Other sections",
      color: OTHER_COLOR,
      points: [...other.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week_start, { weighted, attempts }]) => ({
          week_start,
          average_score: Math.round((weighted / attempts) * 10) / 10,
        })),
    });
  }
  return series;
}

/** Every bucket any series has a point in, oldest first — the shared x-axis. */
function bucketsOf(series: TrendSeries[]): string[] {
  const all = new Set<string>();
  for (const s of series) for (const p of s.points) all.add(p.week_start);
  return [...all].sort();
}

/**
 * Legend for two or more series; a lone series is named by the card's title.
 * Clicking a section isolates its bars — the chart is handed that series
 * alone — and clicking it again, or "Show all", brings the rest back. The
 * legend lists every section either way, so the way back stays in view and
 * the dimmed entries still say which colour belongs to whom.
 */
export function TrendLegend({
  series,
  focused,
  onFocus,
}: {
  series: TrendSeries[];
  focused: string | null;
  onFocus: (id: string | null) => void;
}) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label="Sections">
      {series.map((s) => {
        const isFocused = focused === s.id;
        const dimmed = focused !== null && !isFocused;
        return (
          <li key={s.id} className="flex">
            <button
              type="button"
              onClick={() => onFocus(isFocused ? null : s.id)}
              aria-pressed={isFocused}
              title={isFocused ? "Show all sections" : `Show only ${s.name}`}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-subtle ${
                dimmed ? "text-gray-400" : "text-gray-600"
              } ${isFocused ? "bg-subtle font-medium" : ""}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color, opacity: dimmed ? 0.4 : 1 }}
              />
              {s.name}
            </button>
          </li>
        );
      })}
      {focused !== null && (
        <li className="flex">
          <button
            type="button"
            onClick={() => onFocus(null)}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-brand-600 transition-colors hover:bg-subtle"
          >
            Show all
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * Drawn at the real pixel size of the space it's given, rather than scaled
 * from a fixed viewBox — scaling made text and lines grow with the card. In a
 * flex column it grows to fill the card (a row stretched by a taller
 * neighbour leaves no dead band), and never draws shorter than this.
 */
const MIN_H = 240;
/** Tick labels ("Aug 24") need about this much room each. */
const TICK_SPACING = 72;
const PAD_L = 32;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
/** Share of each period's band the bar cluster fills; the rest separates periods. */
const CLUSTER_FILL = 0.72;
/** A wider bar reads as a block rather than a value. */
const MAX_BAR_W = 28;
/** Bars this wide or more get a hairline gap from their neighbour. */
const GAP_FROM_W = 6;

/** A bar rising from the baseline with its top corners rounded. */
function barPath(x: number, w: number, top: number, base: number): string {
  const r = Math.min(3, w / 2, base - top);
  return `M ${x},${base} V ${top + r} Q ${x},${top} ${x + r},${top} H ${x + w - r} Q ${x + w},${top} ${x + w},${top + r} V ${base} Z`;
}

export function TrendBarChart({
  series,
  focused = null,
  bucket,
}: {
  series: TrendSeries[];
  /** Isolate one section's bars. The x-axis still spans every series, so
   *  isolating a section never shifts the periods under it. */
  focused?: string | null;
  bucket: AnalyticsBucket;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.floor(entry.contentRect.width),
        h: Math.floor(entry.contentRect.height),
      }),
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const W = size?.w ?? 0;
  const H = Math.max(size?.h ?? MIN_H, MIN_H);

  // Every series sets the axis; `shown` is what actually gets drawn.
  const buckets = bucketsOf(series);
  const shown = focused === null ? series : series.filter((s) => s.id === focused);
  const n = buckets.length;
  const last = n - 1;

  const plotH = H - PAD_T - PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const band = n === 0 ? plotW : plotW / n;
  const center = (i: number) => PAD_L + (i + 0.5) * band;
  const y = (v: number) => PAD_T + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;
  const base = PAD_T + plotH;
  const grid = [0, 25, 50, 75, 100];
  const tickStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / TICK_SPACING))));
  // The last bucket is always labelled, so a regular tick too close to it gives way.
  const isTick = (i: number) => i === last || (i % tickStep === 0 && last - i >= tickStep);

  // Each section holds the same place in every cluster, so its bars line up
  // period to period the way a line would.
  const k = Math.max(shown.length, 1);
  const slotW = Math.min((band * CLUSTER_FILL) / k, MAX_BAR_W);
  const gap = slotW >= GAP_FROM_W ? 1.5 : 0;
  const barW = Math.max(slotW - gap, 1);
  const clusterW = slotW * k;
  const at = shown.map((s) => new Map(s.points.map((p) => [p.week_start, p])));

  // Hovering anywhere in a period's band picks the whole cluster, so the
  // reader aims at a date, never at a thin bar.
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((vx - PAD_L) / band);
    setHover(Math.min(Math.max(i, 0), last));
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => {
      const from = h ?? last;
      return Math.min(Math.max(from + (e.key === "ArrowRight" ? 1 : -1), 0), last);
    });
  };

  const hoverX = hover === null ? 0 : center(hover);
  const hoverBucket = hover === null ? null : buckets[hover];
  const flip = hoverX > W * 0.6;

  return (
    // The box takes its size from the layout alone — the SVG is positioned
    // over it, so a drawn chart never props the card open once it can shrink.
    <div ref={boxRef} className="relative min-h-60 flex-1">
      {size !== null && (
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 block overflow-visible"
          role="img"
          aria-label={`Average quiz score per period for ${shown.map((s) => s.name).join(", ")}, one bar per section. Dashed line marks the ${TARGET_SCORE}% target. Use the table view for exact values.`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? last)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {hover !== null && (
            <rect
              x={PAD_L + hover * band}
              y={PAD_T}
              width={band}
              height={plotH}
              fill="var(--color-gray-400)"
              fillOpacity="0.1"
            />
          )}

          {grid.map((g) => (
            <g key={g}>
              <line
                x1={PAD_L}
                y1={y(g)}
                x2={W - PAD_R}
                y2={y(g)}
                stroke="var(--color-hairline)"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 6}
                y={y(g) + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--color-gray-400)"
                className="tabular-nums"
              >
                {g}
              </text>
            </g>
          ))}

          {buckets.map((b, i) => {
            const left = center(i) - clusterW / 2;
            return shown.map((s, si) => {
              const p = at[si].get(b);
              if (!p) return null;
              const top = y(p.average_score);
              return (
                <path
                  key={`bar-${s.id}-${b}`}
                  d={barPath(left + si * slotW + gap / 2, barW, Math.min(top, base - 1), base)}
                  fill={s.color}
                  fillOpacity={hover === null || hover === i ? 1 : 0.55}
                />
              );
            });
          })}

          {/* Drawn over the bars in a neutral dash — every hue belongs to a section. */}
          <line
            x1={PAD_L}
            y1={y(TARGET_SCORE)}
            x2={W - PAD_R}
            y2={y(TARGET_SCORE)}
            stroke="var(--color-gray-500)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <text
            x={W - PAD_R - 4}
            y={y(TARGET_SCORE) - 5}
            textAnchor="end"
            fontSize="10"
            fontWeight="600"
            fill="var(--color-gray-600)"
            stroke="var(--color-surface)"
            strokeWidth="3"
            paintOrder="stroke"
          >
            Target {TARGET_SCORE}%
          </text>

          {buckets.map((b, i) =>
            isTick(i) ? (
              <text
                key={`t-${b}`}
                x={center(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-gray-400)"
              >
                {formatBucket(b, bucket)}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hoverBucket !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-overlay"
          style={{
            left: hoverX,
            transform: flip
              ? `translateX(calc(-100% - ${band / 2 + 6}px))`
              : `translateX(${band / 2 + 6}px)`,
          }}
        >
          <p className="mb-1.5 text-[11px] font-medium text-gray-500">
            {formatBucket(hoverBucket, bucket)}
          </p>
          <ul className="space-y-1">
            {shown.map((s, si) => {
              const p = at[si].get(hoverBucket);
              return (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold tabular-nums text-gray-900">
                    {p ? `${p.average_score}%` : "—"}
                  </span>
                  <span className="truncate text-gray-500">{s.name}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 flex items-center gap-2 border-t border-hairline pt-1.5 text-[11px] text-gray-500">
            <span className="w-2 shrink-0 border-t-[1.5px] border-dashed border-gray-500" />
            Target {TARGET_SCORE}%
          </p>
        </div>
      )}
    </div>
  );
}

/** The same numbers as the chart, readable without hovering or telling colours apart. */
export function TrendTable({
  series,
  bucket,
}: {
  series: TrendSeries[];
  bucket: AnalyticsBucket;
}) {
  const buckets = bucketsOf(series);
  const at = series.map((s) => new Map(s.points.map((p) => [p.week_start, p])));
  return (
    // Fills the card like the chart does, scrolling inside it when there are
    // more periods than fit — the table is positioned over its box, so a long
    // one never stretches the card past its row.
    <div className="relative min-h-60 flex-1">
      <div className="absolute inset-0 overflow-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-subtle text-xs text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Period
              </th>
              {series.map((s) => (
                <th key={s.id} scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {buckets.map((b) => (
              <tr key={b}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal text-gray-600">
                  {formatBucket(b, bucket)}
                </th>
                {at.map((m, i) => {
                  const p = m.get(b);
                  return (
                    <td key={series[i].id} className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                      {p ? `${p.average_score}%` : <span className="text-gray-400">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
