"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookMedical } from "@fortawesome/free-solid-svg-icons";
import Card from "../../components/Card";
import type { CoursePerformance as CourseRow } from "../../lib/api";
import { formatGrade } from "../../lib/course-grading";
import { TARGET_SCORE } from "../../lib/performance-target";
import { courseTabHref } from "../courses/course-tabs";
import { barPath } from "./GroupTrendChart";

/** The grade thresholds the skill area chart beside it uses, so a colour means the same in both. */
const fillFor = (v: number) => {
  if (v >= 75) return "fill-emerald-600";
  if (v >= 50) return "fill-amber-600";
  return "fill-rose-600";
};

const H = 300;
const PAD_L = 32;
const PAD_R = 16;
/** Room above a 100% bar for its value. */
const PAD_T = 24;
/** Two label lines under the axis: the course, then its term. */
const PAD_B = 48;
const MAX_BAR_W = 56;
/** Tooltip width, so it can be placed where it fits. */
const TIP_W = 200;
/** Approximate width of a title character at 11px. */
const TITLE_CHAR_W = 6.2;
const GRID = [0, 25, 50, 75, 100];

/** Cuts a label to about what fits in `px` of text `charW` wide per character. */
function fit(text: string, px: number, charW: number): string {
  const max = Math.max(4, Math.floor(px / charW));
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * One column per course, its height the class average grade, in an equal
 * band each so a few courses spread across the card instead of huddling in
 * the middle. Pinned to 0–100 like the skill areas: these are percentages.
 * Hovering anywhere in a course's band picks it; clicking opens the course's
 * Performance tab, where the average comes from.
 */
function CourseBarChart({ courses }: { courses: CourseRow[] }) {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);

  // Drawn at the box's real width, so text never scales with the card.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const W = width ?? 0;
  const n = courses.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const band = plotW / Math.max(n, 1);
  const barW = Math.min(MAX_BAR_W, band * 0.5);
  const center = (i: number) => PAD_L + (i + 0.5) * band;
  const y = (v: number) => PAD_T + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;
  const base = PAD_T + plotH;
  // Labels may use most of the band, not just the bar.
  const labelW = band - 8;
  const titleRoom = (c: CourseRow) => labelW - (c.course.code.length + 1) * 6.4;

  const open = (c: CourseRow) => router.push(courseTabHref(c.id, "performance"));
  const onKeyDown = (e: KeyboardEvent<SVGGElement>, c: CourseRow) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    open(c);
  };

  const hovered = hover === null ? null : courses[hover];
  const hoverX = hover === null ? 0 : center(hover);
  // Beside the bar, on whichever side has room; on a narrow card, centred
  // over it and kept inside the card.
  const besideRight = hoverX + barW / 2 + 8;
  const besideLeft = hoverX - barW / 2 - 8 - TIP_W;
  const tipLeft =
    besideRight + TIP_W <= W
      ? besideRight
      : besideLeft >= 0
        ? besideLeft
        : Math.min(Math.max(hoverX - TIP_W / 2, 0), Math.max(W - TIP_W, 0));

  return (
    <div ref={boxRef} className="relative" style={{ height: H }}>
      {width !== null && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block overflow-visible">
          {GRID.map((g) => (
            <g key={g}>
              <line x1={PAD_L} y1={y(g)} x2={W - PAD_R} y2={y(g)} stroke="var(--color-hairline)" strokeWidth="1" />
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

          {courses.map((c, i) => {
            const x = center(i) - barW / 2;
            const value = c.average;
            const dimmed = hover !== null && hover !== i;
            const status =
              value === null
                ? "no grades"
                : `${formatGrade(value)} class average, ${c.graded} of ${c.students} students graded`;
            return (
              <g
                key={c.id}
                role="link"
                tabIndex={0}
                aria-label={`${c.course.code} ${c.course.title}, ${c.term.name}: ${status}. Opens the course's Performance tab.`}
                className="cursor-pointer outline-none"
                onClick={() => open(c)}
                onKeyDown={(e) => onKeyDown(e, c)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              >
                {/* The whole band is the hit target, so the reader aims at a course, not a thin bar. */}
                <rect
                  x={PAD_L + i * band}
                  y={PAD_T}
                  width={band}
                  height={H - PAD_T}
                  fill="var(--color-gray-400)"
                  fillOpacity={hover === i ? 0.1 : 0}
                />
                {/* Faint full-height track, as on the skill area bars: the distance left to 100%. */}
                <path d={barPath(x, barW, PAD_T, base)} className="fill-gray-100" />
                {value !== null && (
                  <>
                    <path
                      d={barPath(x, barW, Math.min(y(value), base - 1), base)}
                      className={`${fillFor(value)} transition-[transform,opacity] duration-700 ease-out`}
                      style={{
                        transform: grown ? "scaleY(1)" : "scaleY(0)",
                        transformBox: "fill-box",
                        transformOrigin: "bottom",
                        opacity: dimmed ? 0.55 : 1,
                      }}
                    />
                    <text
                      x={center(i)}
                      y={y(value) - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      className="fill-gray-700 tabular-nums transition-opacity duration-700"
                      style={{ opacity: grown ? 1 : 0 }}
                    >
                      {formatGrade(value)}
                    </text>
                  </>
                )}
                {value === null && (
                  <text x={center(i)} y={base - 8} textAnchor="middle" fontSize="10" fill="var(--color-gray-400)">
                    No grades
                  </text>
                )}
                <text x={center(i)} y={base + 18} textAnchor="middle" fontSize="11" className="fill-gray-700">
                  <tspan fontWeight="600">{fit(c.course.code, labelW, 6.4)}</tspan>
                  {/* The title only when a useful part of it fits beside the code. */}
                  {titleRoom(c) >= 8 * TITLE_CHAR_W && (
                    <tspan className="fill-gray-500"> {fit(c.course.title, titleRoom(c), TITLE_CHAR_W)}</tspan>
                  )}
                </text>
                <text x={center(i)} y={base + 33} textAnchor="middle" fontSize="10" fill="var(--color-gray-400)">
                  {fit(c.term.name, labelW, 5.6)}
                </text>
              </g>
            );
          })}

          {/* Over the bars in a neutral dash, as on the group charts. */}
          <line
            x1={PAD_L}
            y1={y(TARGET_SCORE)}
            x2={W - PAD_R}
            y2={y(TARGET_SCORE)}
            stroke="var(--color-gray-500)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-overlay"
          style={{ left: tipLeft, top: PAD_T, width: TIP_W }}
        >
          <p className="text-xs font-semibold text-gray-900">
            {hovered.course.code} <span className="font-normal text-gray-600">{hovered.course.title}</span>
          </p>
          <p className="mb-1.5 text-[11px] text-gray-400">{hovered.term.name}</p>
          <p className="text-xs text-gray-600">
            <span className="font-semibold tabular-nums text-gray-900">
              {hovered.average === null ? "—" : formatGrade(hovered.average)}
            </span>{" "}
            class average
          </p>
          <p className="text-[11px] text-gray-500">
            {hovered.graded === 0
              ? `${hovered.students} student${hovered.students === 1 ? "" : "s"}, none graded`
              : `${hovered.graded} of ${hovered.students} students graded`}
          </p>
          <p className="mt-1.5 border-t border-hairline pt-1.5 text-[11px] text-brand-600">Click to open the course</p>
        </div>
      )}
    </div>
  );
}

/**
 * "Performance per Course": the class average of the grade so far in each
 * course the instructor teaches in a term overlapping the range, against the
 * same dashed target as the other charts.
 */
export default function CoursePerformance({
  courses,
  error,
  rangeLabel,
  className = "",
}: {
  courses: CourseRow[];
  error: string | null;
  /** "Jul 17 – Oct 17", for the empty state. */
  rangeLabel: string;
  /** Its place in the page's grid. */
  className?: string;
}) {
  return (
    <Card padding="md" className={`flex flex-col ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-brand-600/10 p-2.5">
            <FontAwesomeIcon icon={faBookMedical} className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Performance per Course</h3>
            <p className="text-xs text-gray-400">Class average grade, terms in this range</p>
          </div>
        </div>
        {courses.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="h-3 border-l border-dashed border-gray-500" /> Target {TARGET_SCORE}%
          </span>
        )}
      </div>

      {/* Centred when a taller card beside it stretches the row, as the skill areas are. */}
      <div className="flex flex-1 flex-col justify-center">
        {error ? (
          <p className="py-10 text-center text-sm text-gray-400">{error}</p>
        ) : courses.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            None of your courses has students in these sections during {rangeLabel}.
          </p>
        ) : (
          <CourseBarChart courses={courses} />
        )}
      </div>
    </Card>
  );
}
