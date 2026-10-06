"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { usePageData } from "../../../lib/use-page-data";
import { fetchMyCourses, type FacultyCourseSummary } from "../../../lib/api";
import { termStatus, type TermStatus } from "../../../lib/course-progress";
import { courseTabHref, type CourseTab } from "../course-tabs";

const NO_COURSES: FacultyCourseSummary[] = [];
const STATUS_ORDER: Record<TermStatus, number> = { current: 0, upcoming: 1, ended: 2 };

/**
 * "Courses › NCM 101 ▾": back to the list, or straight across to another of
 * the instructor's courses on the same tab. The list comes from the Courses
 * page's cached data, so opening the menu costs nothing after a visit there.
 */
export default function CourseCrumbs({ offeringId, code, tab }: { offeringId: string; code: string | null; tab: CourseTab }) {
  const { data } = usePageData("faculty:courses", fetchMyCourses);
  const offerings = data?.data?.offerings ?? NO_COURSES;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const terms = [...new Map(offerings.map((o) => [o.term.id, o.term])).values()].sort(
    (a, b) => STATUS_ORDER[termStatus(a)] - STATUS_ORDER[termStatus(b)] || b.starts_on.localeCompare(a.starts_on),
  );
  const label = code ?? "Course";

  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 items-center gap-1.5 text-sm">
      <Link href="/faculty/courses" className="inline-flex shrink-0 items-center gap-1.5 font-medium text-brand-700 hover:underline">
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
        Courses
      </Link>
      <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5 shrink-0 text-gray-300" aria-hidden />
      <div ref={ref} className="relative min-w-0">
        {offerings.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`${label}: switch course`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-gray-700 transition-colors hover:bg-subtle hover:text-gray-900"
          >
            <span className="truncate">{label}</span>
            <FontAwesomeIcon icon={faChevronDown} className={`h-2.5 w-2.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        ) : (
          <span className="block truncate px-2 py-1 font-medium text-gray-700" aria-current="page">
            {label}
          </span>
        )}
        {open && (
          <div
            role="menu"
            aria-label="Your courses"
            className="absolute left-0 top-full z-40 mt-1.5 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
          >
            {terms.map((term) => (
              <div key={term.id}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{term.name}</p>
                {offerings
                  .filter((o) => o.term.id === term.id)
                  .map((o) => {
                    const here = o.id === offeringId;
                    return (
                      <Link
                        key={o.id}
                        role="menuitem"
                        href={courseTabHref(o.id, tab)}
                        aria-current={here ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-subtle ${here ? "bg-brand-600/5" : ""}`}
                      >
                        <span className={`shrink-0 font-semibold ${here ? "text-brand-700" : "text-gray-800"}`}>{o.course.code}</span>
                        <span className="truncate text-gray-500">{o.course.title}</span>
                        {here && <FontAwesomeIcon icon={faCheck} className="ml-auto h-3 w-3 shrink-0 text-brand-600" />}
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
