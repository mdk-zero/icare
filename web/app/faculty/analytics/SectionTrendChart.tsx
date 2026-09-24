"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AnalyticsBucket, AnalyticsSummary, Section } from "../../lib/api";
import { formatBucket } from "./dates";

/*
 * "Classroom Performance Overview": average quiz score over time, one line per
 * section. Each section keeps one colour for good — its position among the
 * sections this faculty member manages picks a slot in the fixed series
 * palette (globals.css) — so narrowing the section filter never repaints the
 * lines that remain.
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
 * all-sections line. Past eight sections, the ninth onward fold into one
 * attempt-weighted "Other sections" line rather than cycling a hue.
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

/** Catmull-Rom → cubic bezier: a smooth curve that passes through every point. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * Legend for two or more series; a lone line is named by the card's title.
 * Clicking a section isolates its line — the chart is handed that series
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
const PAD_T = 16;
const PAD_B = 36;
/** Room at the right edge for direct end-labels, when they are drawn. */
const LABEL_ROOM = 64;
const LABEL_MIN_GAP = 12;
/** Past this many buckets, only each line's end gets a marker. */
const MAX_MARKED_BUCKETS = 16;

export function TrendLineChart({
  series,
  focused = null,
  bucket,
}: {
  series: TrendSeries[];
  /** Isolate one section's line. The x-axis still spans every series, so an
   *  isolated line sits exactly where it sat among the others. */
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
  const indexOf = new Map(buckets.map((b, i) => [b, i]));
  const last = n - 1;

  // Direct end-labels supplement the legend for a few lines, and only when
  // every line runs to the last bucket and their ends sit apart. Converging
  // ends are left to the legend and tooltip rather than nudged off their lines.
  const yRaw = (v: number) => 1 - Math.min(Math.max(v, 0), 100) / 100;
  const ends = series.map((s) => s.points[s.points.length - 1]);
  const endSlots = ends.map((p) => yRaw(p.average_score)).sort((a, b) => a - b);
  const plotH = H - PAD_T - PAD_B;
  // The room is judged on every series, so isolating a line doesn't re-stretch
  // the plot under it; the labels themselves want two or more lines to tell
  // apart — an isolated line is named by the card's title instead.
  const labelRoom =
    series.length >= 2 &&
    series.length <= 4 &&
    ends.every((p) => indexOf.get(p.week_start) === last) &&
    endSlots.every((v, i) => i === 0 || (v - endSlots[i - 1]) * plotH >= LABEL_MIN_GAP);
  const labelEnds = labelRoom && shown.length >= 2;

  const padR = labelRoom ? LABEL_ROOM : 16;
  const plotW = W - PAD_L - padR;
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + yRaw(v) * plotH;
  const grid = [0, 25, 50, 75, 100];
  const tickStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / TICK_SPACING))));
  // The last bucket is always labelled, so a regular tick too close to it gives way.
  const isTick = (i: number) => i === last || (i % tickStep === 0 && last - i >= tickStep);
  const marked = n <= MAX_MARKED_BUCKETS;

  const drawn = shown.map((s) => ({
    ...s,
    pts: s.points.map((p) => ({ x: x(indexOf.get(p.week_start)!), y: y(p.average_score), p })),
  }));

  // The crosshair snaps to the nearest bucket, so the reader aims at a date,
  // never at a 2px line.
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = n === 1 ? 0 : Math.round(((vx - PAD_L) / plotW) * (n - 1));
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

  const hoverX = hover === null ? 0 : x(hover);
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
          aria-label={`Average quiz score over time for ${shown.map((s) => s.name).join(", ")}. Use the table view for exact values.`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? last)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {grid.map((g) => (
            <g key={g}>
              <line
                x1={PAD_L}
                y1={y(g)}
                x2={W - padR}
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

          {/* A lone line keeps a faint wash under it; overlapping washes would muddy. */}
          {drawn.length === 1 && drawn[0].pts.length > 1 && (
            <path
              d={`${smoothPath(drawn[0].pts)} L ${drawn[0].pts[drawn[0].pts.length - 1].x},${PAD_T + plotH} L ${drawn[0].pts[0].x},${PAD_T + plotH} Z`}
              fill={drawn[0].color}
              fillOpacity="0.1"
            />
          )}

          {drawn.map((s) =>
            s.pts.length > 1 ? (
              <path
                key={`line-${s.id}`}
                d={smoothPath(s.pts)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}

          {hover !== null && (
            <line
              x1={hoverX}
              y1={PAD_T}
              x2={hoverX}
              y2={PAD_T + plotH}
              stroke="var(--color-gray-400)"
              strokeWidth="1"
            />
          )}

          {/* Markers carry a 2px surface ring so they stay legible where lines cross. */}
          {drawn.map((s) =>
            s.pts.map((pt, i) => {
              const isEnd = i === s.pts.length - 1;
              const isHovered = hoverBucket === pt.p.week_start;
              if (!marked && !isEnd && !isHovered) return null;
              return (
                <circle
                  key={`dot-${s.id}-${pt.p.week_start}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 5 : 4}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              );
            }),
          )}

          {labelEnds &&
            drawn.map((s) => {
              const end = s.pts[s.pts.length - 1];
              return (
                <text
                  key={`label-${s.id}`}
                  x={end.x + 9}
                  y={end.y + 3.5}
                  fontSize="10"
                  fontWeight="600"
                  fill="var(--color-gray-600)"
                >
                  {s.name}
                </text>
              );
            })}

          {buckets.map((b, i) =>
            isTick(i) ? (
              <text
                key={`t-${b}`}
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 && n > 1 ? "start" : i === last && n > 1 ? "end" : "middle"}
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
            transform: flip ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <p className="mb-1.5 text-[11px] font-medium text-gray-500">
            {formatBucket(hoverBucket, bucket)}
          </p>
          <ul className="space-y-1">
            {shown.map((s) => {
              const p = s.points.find((q) => q.week_start === hoverBucket);
              return (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold tabular-nums text-gray-900">
                    {p ? `${p.average_score}%` : "—"}
                  </span>
                  <span className="truncate text-gray-500">{s.name}</span>
                </li>
              );
            })}
          </ul>
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
