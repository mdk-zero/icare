"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookMedical } from "@fortawesome/free-solid-svg-icons";
import Card from "../../components/Card";
import type { CoursePerformance as CourseRow } from "../../lib/api";
import { formatGrade } from "../../lib/course-grading";
import { TARGET_SCORE } from "../../lib/performance-target";
import { courseTabHref } from "../courses/course-tabs";

const SCALE = [0, 25, 50, 75, 100];

/** The grade thresholds the skill area chart beside it uses, so a colour means the same in both. */
const fillFor = (v: number) => {
  if (v >= 75) return "bg-emerald-600";
  if (v >= 50) return "bg-amber-600";
  return "bg-rose-600";
};

/**
 * Label, then bar, then value on a wide card; on a phone the label takes its
 * own line above the bar. The axis row reuses the bar's column.
 */
const ROW = "grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-4 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_3.5rem]";

/**
 * "Performance per Course": one horizontal bar per course the instructor
 * teaches in a term overlapping the range, for the class average of the grade
 * so far, against the same dashed target as the other charts. Each row opens
 * that course's Performance tab, where the average comes from.
 */
export default function CoursePerformance({
  courses,
  error,
  rangeLabel,
}: {
  courses: CourseRow[];
  error: string | null;
  /** "Jul 17 – Oct 17", for the empty state. */
  rangeLabel: string;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Card padding="md" className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-brand-600/10 p-2.5">
            <FontAwesomeIcon icon={faBookMedical} className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Performance per Course</h3>
            <p className="text-xs text-gray-400">Class average grade so far, for terms in this range</p>
          </div>
        </div>
        {courses.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="h-3 border-l border-dashed border-gray-500" /> Target {TARGET_SCORE}%
          </span>
        )}
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-gray-400">{error}</p>
      ) : courses.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          None of your courses has students in these sections during {rangeLabel}.
        </p>
      ) : (
        <div>
          <ul className="space-y-1">
            {courses.map((c) => {
              const value = c.average;
              const status =
                value === null
                  ? "no grades"
                  : `${formatGrade(value)} class average, ${c.graded} of ${c.students} students graded`;
              return (
                <li key={c.id}>
                  <Link
                    href={courseTabHref(c.id, "performance")}
                    title={`${c.course.code} ${c.course.title}, ${c.term.name}: ${status}. Open the course's Performance tab.`}
                    className={`${ROW} gap-y-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-subtle`}
                  >
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm text-gray-900">
                        <span className="font-semibold">{c.course.code}</span>{" "}
                        <span className="text-gray-600">{c.course.title}</span>
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {c.term.name} ·{" "}
                        {c.graded === 0
                          ? `${c.students} student${c.students === 1 ? "" : "s"}, none graded`
                          : `${c.graded} of ${c.students} graded`}
                      </p>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-gray-100">
                      {value !== null && (
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ease-out ${fillFor(value)}`}
                          style={{ width: grown ? `${Math.min(Math.max(value, 0), 100)}%` : "0%" }}
                        />
                      )}
                      <span
                        className="absolute -inset-y-1 border-l-[1.5px] border-dashed border-gray-500"
                        style={{ left: `${TARGET_SCORE}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="text-right text-sm font-semibold tabular-nums text-gray-900">
                      {value === null ? <span className="font-normal text-gray-400">—</span> : formatGrade(value)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className={`${ROW} px-2`} aria-hidden>
            <div className="relative h-4 sm:col-start-2">
              {SCALE.map((v) => (
                <span
                  key={v}
                  className={`absolute top-0.5 -translate-x-1/2 text-[10px] tabular-nums ${
                    v === TARGET_SCORE ? "font-semibold text-gray-700" : "text-gray-400"
                  }`}
                  style={{ left: `${v}%` }}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
