"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookMedical, faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { termStatus, type TermStatus } from "../../lib/course-progress";

const STATUS_ORDER: Record<TermStatus, number> = { current: 0, upcoming: 1, ended: 2 };

const rowClass =
  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-gray-700 hover:bg-subtle";

/** One course assignment on the list. */
export interface CourseChoice {
  id: string;
  course: { code: string; title: string };
  term: { id: string; name: string; starts_on: string; ends_on: string };
  student_count: number;
  /** Who teaches it, on a Dean's list, which has every instructor's assignments. */
  instructor?: string | null;
}

/**
 * Picks one course assignment for the Analytics page, or all of them: an
 * instructor's own, or those of a Dean's courses, where the same course under
 * two instructors is two rows. One at a time: a course is a whole scope of its
 * own (its roster, its work, its term), so two together would have no term to
 * read them in. Listed under their terms, running ones first, the way the
 * Courses page lists them.
 */
export default function CourseFilter<T extends CourseChoice>({
  offerings,
  value,
  loading,
  onChange,
}: {
  offerings: T[];
  value: string | null;
  loading: boolean;
  onChange: (offering: T | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (offering: T | null) => {
    setOpen(false);
    buttonRef.current?.focus();
    onChange(offering);
  };

  const selected = offerings.find((o) => o.id === value) ?? null;
  const summary = selected ? `${selected.course.code} ${selected.course.title}` : "All courses";
  const terms = [...new Map(offerings.map((o) => [o.term.id, o.term])).values()].sort(
    (a, b) => STATUS_ORDER[termStatus(a)] - STATUS_ORDER[termStatus(b)] || b.starts_on.localeCompare(a.starts_on),
  );

  return (
    <div
      ref={boxRef}
      className="relative min-w-0"
      onBlur={(e) => {
        // Tabbing out of the list closes it, as clicking away does.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-expanded={open}
        aria-label={`Course: ${summary}`}
        title={selected ? summary : undefined}
        className="flex max-w-full items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-56 xl:max-w-72"
      >
        <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className="min-w-0 truncate font-medium">{summary}</span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3 w-3 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 max-h-80 w-80 max-w-[calc(100vw-6.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-hairline bg-surface p-1.5 shadow-overlay">
          <button type="button" onClick={() => pick(null)} aria-pressed={selected === null} className={rowClass}>
            <span className="font-medium">All courses</span>
            {selected === null && <FontAwesomeIcon icon={faCheck} className="h-3 w-3 shrink-0 text-brand-600" />}
          </button>
          {terms.map((term) => (
            <div key={term.id} role="group" aria-label={term.name}>
              <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{term.name}</p>
              {offerings
                .filter((o) => o.term.id === term.id)
                .map((o) => {
                  const on = o.id === selected?.id;
                  return (
                    <button key={o.id} type="button" onClick={() => pick(o)} aria-pressed={on} className={rowClass}>
                      <span className="min-w-0">
                        <span className="block truncate">
                          <span className="font-semibold text-gray-900">{o.course.code}</span> {o.course.title}
                        </span>
                        {o.instructor && <span className="block truncate text-xs text-gray-500">{o.instructor}</span>}
                      </span>
                      {on ? (
                        <FontAwesomeIcon icon={faCheck} className="h-3 w-3 shrink-0 text-brand-600" />
                      ) : (
                        <span
                          className="shrink-0 text-xs tabular-nums text-gray-400"
                          title={`${o.student_count} ${o.student_count === 1 ? "student" : "students"}`}
                        >
                          {o.student_count}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
