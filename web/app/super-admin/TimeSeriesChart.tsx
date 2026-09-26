"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface SeriesDef {
  label: string;
  /** A CSS color, normally one of the --chart-* tokens. */
  color: string;
}

export interface SeriesPoint {
  /** ISO timestamp of the bucket start. */
  t: string;
  values: (number | null)[];
}

interface Props {
  series: SeriesDef[];
  points: SeriesPoint[];
  kind?: "line" | "bar";
  format: (value: number) => string;
  /** How the x labels and tooltip read a bucket. */
  bucket: "minute" | "hour" | "day";
  height?: number;
  /** Fixes the y-axis top, e.g. 100 for a percentage. */
  yMax?: number;
  ariaLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

function formatTick(iso: string, bucket: Props["bucket"]): string {
  const d = new Date(iso);
  if (bucket === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: bucket === "minute" ? "2-digit" : undefined });
}

function formatFull(iso: string, bucket: Props["bucket"]): string {
  const d = new Date(iso);
  if (bucket === "day") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Rounds a max up to a 1/2/5 step so the gridlines land on readable values. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/**
 * A small single-axis time-series chart: 2px lines (or thin bars), recessive
 * grid, a crosshair tooltip on hover/focus, and a legend when there is more
 * than one series. Width follows the container.
 */
export default function TimeSeriesChart({
  series,
  points,
  kind = "line",
  format,
  bucket,
  height = 200,
  yMax,
  ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const top = useMemo(() => {
    if (yMax !== undefined) return yMax;
    let max = 0;
    for (const p of points) for (const v of p.values) if (v !== null && v > max) max = v;
    return niceMax(max);
  }, [points, yMax]);

  const n = points.length;
  const x = (i: number) =>
    kind === "bar" ? PAD.left + ((i + 0.5) * innerW) / Math.max(n, 1) : PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => PAD.top + innerH - (Math.min(v, top) / top) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 80))));

  const indexAt = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    const px = clientX - rect.left - PAD.left;
    const i = kind === "bar" ? Math.floor((px / innerW) * n) : Math.round((px / innerW) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  if (n === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>
        No requests recorded in this window yet
      </div>
    );
  }

  const barW = Math.max(2, innerW / n - 2);
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-600">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrapRef}
        className="relative"
        onPointerMove={(e) => setHover(indexAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onFocus={() => setHover(n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
          }}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-400 text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.t} x={x(i)} y={height - 6} textAnchor="middle" className="fill-gray-400 text-[10px]">
                {formatTick(p.t, bucket)}
              </text>
            ) : null,
          )}

          {kind === "bar"
            ? points.map((p, i) => {
                const v = p.values[0];
                if (v === null || v <= 0) return null;
                const h = Math.max(1, PAD.top + innerH - y(v));
                const bx = x(i) - barW / 2;
                const by = PAD.top + innerH - h;
                const r = Math.min(4, barW / 2, h);
                return (
                  <path
                    key={p.t}
                    d={`M${bx},${by + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + barW - r} Q${bx + barW},${by} ${bx + barW},${by + r} V${by + h} Z`}
                    fill={series[0].color}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                );
              })
            : series.map((s, si) => {
                let d = "";
                let pen = false;
                points.forEach((p, i) => {
                  const v = p.values[si];
                  if (v === null) {
                    pen = false;
                    return;
                  }
                  d += `${pen ? "L" : "M"}${x(i)},${y(v)} `;
                  pen = true;
                });
                return (
                  <path
                    key={s.label}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              })}

          {hovered && hover !== null && (
            <g pointerEvents="none">
              {kind === "line" && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke="var(--color-foreground)"
                  strokeOpacity={0.25}
                />
              )}
              {kind === "line" &&
                series.map((s, si) => {
                  const v = hovered.values[si];
                  return v === null ? null : (
                    <circle
                      key={s.label}
                      cx={x(hover)}
                      cy={y(v)}
                      r={4.5}
                      fill={s.color}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                    />
                  );
                })}
            </g>
          )}
        </svg>

        {hovered && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
            style={
              x(hover) > width / 2
                ? { right: width - x(hover) + 10 }
                : { left: x(hover) + 10 }
            }
          >
            <p className="font-medium text-gray-700 mb-1">{formatFull(hovered.t, bucket)}</p>
            {series.map((s, si) => (
              <p key={s.label} className="flex items-center justify-between gap-3 text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {hovered.values[si] === null ? "—" : format(hovered.values[si]!)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
