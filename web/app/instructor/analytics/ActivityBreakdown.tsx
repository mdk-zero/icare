"use client";

import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "../../lib/api";
import { TARGET_SCORE } from "../../lib/performance-target";
import { WORK_KINDS } from "../../lib/work-kinds";

/** The thresholds the skill area and course charts use, so a colour means the same everywhere. */
function tone(v: number) {
  if (v >= 75) return { text: "text-emerald-600", bar: "bg-emerald-500" };
  if (v >= 50) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500" };
}

/**
 * The average grade per kind of graded work (Patient Cases, Quizzes, Case
 * Presentations, Return Demonstrations) for the dashboard's scope and range,
 * from the warehouse (migration 085). Every kind is listed, so one with
 * nothing graded reads as a gap rather than going missing. Body only: each
 * dashboard frames it in its own card.
 */
export default function ActivityBreakdown({
  byKind,
  compact = false,
}: {
  byKind: NonNullable<AnalyticsSummary["cohort"]["by_kind"]>;
  /** Two columns at most, for a card that shares its row. */
  compact?: boolean;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <ul className={`grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${compact ? "" : "xl:grid-cols-4"}`}>
      {WORK_KINDS.map(({ kind, label }) => {
        const k = byKind[kind];
        if (!k) {
          return (
            <li key={kind} className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-500">{label}</p>
              <p className="mt-1 font-display text-2xl font-bold text-gray-300">—</p>
              <div className="mt-2 h-1.5 rounded-full bg-subtle" aria-hidden />
              <p className="mt-1.5 text-xs text-gray-400">Nothing graded in this range</p>
            </li>
          );
        }
        const t = tone(k.average_score);
        const width = `${Math.min(Math.max(k.average_score, 0), 100)}%`;
        return (
          <li key={kind} className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-500">{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${t.text}`}>
              {k.average_score}%
            </p>
            <div className="relative mt-2 h-1.5 rounded-full bg-subtle" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${t.bar}`}
                style={{ width: grown ? width : "0%" }}
              />
              <span
                className="absolute -top-1 h-3.5 border-l border-dashed border-gray-500"
                style={{ left: `${TARGET_SCORE}%` }}
              />
            </div>
            <p className="mt-1.5 truncate text-xs text-gray-400 tabular-nums">
              {k.graded} graded · {k.students} {k.students === 1 ? "student" : "students"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
