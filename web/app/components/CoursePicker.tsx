"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { fetchMyCourses, type FacultyCourseSummary } from "../lib/api";
import { termStatus } from "../lib/course-progress";
import { usePageData } from "../lib/use-page-data";

const NO_OFFERINGS: FacultyCourseSummary[] = [];

/**
 * The instructor's courses an activity can be made for: those whose term
 * hasn't ended (migration 070). Shares the Courses page cache.
 */
export function useActivityCourses() {
  const { data, loading } = usePageData("faculty:courses", fetchMyCourses);
  const all = data?.data?.offerings ?? NO_OFFERINGS;
  const offerings = all.filter((o) => termStatus(o.term) !== "ended");
  return { offerings, loading };
}

/** The chosen offering, or the only one when there is just one to choose. */
export function resolveCourse(offerings: FacultyCourseSummary[], chosen: string): string {
  return chosen || (offerings.length === 1 ? offerings[0].id : "");
}

/**
 * Which of the instructor's courses an activity is for: one chip per
 * course. The activity then counts toward that course's grading.
 */
export default function CoursePicker({
  offerings,
  value,
  onChange,
  what,
}: {
  offerings: FacultyCourseSummary[];
  value: string;
  onChange: (offeringId: string) => void;
  /** "quiz", "case presentation", ... for the hint. */
  what: string;
}) {
  if (offerings.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-gray-800">Course</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Course">
        {offerings.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface text-gray-700 hover:border-brand-600/50"
              }`}
            >
              {on && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
              <span className="font-semibold">{o.course.code}</span>
              <span className={on ? "text-white/80" : "text-gray-500"}>{o.course.title}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">The {what} counts toward this course&apos;s grading.</p>
    </div>
  );
}
