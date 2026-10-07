"use client";

import { useState } from "react";
import Link from "next/link";
import { SkeletonCourseCard, SkeletonTermHeading } from "../../components/skeletons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBookMedical,
  faChartColumn,
  faPercent,
  faChevronRight,
  faPenToSquare,
  faPlus,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import PageHeader from "../../components/PageHeader";
import { usePageData } from "../../lib/use-page-data";
import { fetchMyCourses, type CourseTermRef, type FacultyCourseSummary } from "../../lib/api";
import {
  TERM_STATUS_LABEL,
  formatTermDates,
  termStatus,
  type OfferingSummary,
  type TermStatus,
} from "../../lib/course-progress";
import { COURSE_TABS, courseTabHref } from "./course-tabs";

const NO_COURSES: FacultyCourseSummary[] = [];

const STATUS_STYLE: Record<TermStatus, string> = {
  current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  upcoming: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ended: "bg-gray-100 text-gray-500 ring-gray-500/20",
};

const STATUS_ORDER: Record<TermStatus, number> = { current: 0, upcoming: 1, ended: 2 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The courses a Dean assigned to the signed-in instructor, grouped by term:
 * running and upcoming terms first, past terms folded away. Each card says
 * how far the roster has got, points at what needs doing next, and opens
 * straight onto any of the course's tabs.
 */
export default function FacultyCoursesClient() {
  const { data, loading } = usePageData("faculty:courses", fetchMyCourses);
  const offerings = data?.data?.offerings ?? NO_COURSES;
  const error = data?.error ?? null;
  const [showPast, setShowPast] = useState(false);

  const terms = [...new Map(offerings.map((o) => [o.term.id, o.term])).values()].sort(
    (a, b) =>
      STATUS_ORDER[termStatus(a)] - STATUS_ORDER[termStatus(b)] ||
      b.starts_on.localeCompare(a.starts_on),
  );
  const active = terms.filter((t) => termStatus(t) !== "ended");
  const past = terms.filter((t) => termStatus(t) === "ended");
  // With nothing running or coming up, the past is all there is to show.
  const pastOpen = showPast || active.length === 0;
  const pastCourses = offerings.filter((o) => past.some((t) => t.id === o.term.id)).length;
  const byTerm = (term: CourseTermRef) => offerings.filter((o) => o.term.id === term.id);

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />,
          label: "Teaching",
        }}
        title="Courses"
        subtitle="The courses your Dean assigned you, and what your students must accomplish in each"
      />

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <section aria-busy="true" aria-label="Loading courses">
          <SkeletonTermHeading />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCourseCard key={i} />
            ))}
          </div>
        </section>
      ) : offerings.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-surface px-6 py-14 text-center">
          <FontAwesomeIcon icon={faBookMedical} className="mb-3 h-8 w-8 text-gray-300" />
          <p className="font-semibold text-gray-700">No courses yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Your Dean assigns courses on their Courses page. They appear here once assigned.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.map((term) => (
            <TermSection key={term.id} term={term} offerings={byTerm(term)} />
          ))}
          {past.length > 0 && (
            <section>
              {active.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={pastOpen}
                  className="group flex w-full items-center gap-2.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-800"
                >
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className={`h-3 w-3 transition-transform ${pastOpen ? "rotate-90" : ""}`}
                  />
                  Past terms
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                    {plural(pastCourses, "course")}
                  </span>
                  <span className="h-px flex-1 bg-hairline" aria-hidden />
                </button>
              )}
              {pastOpen && (
                <div className={`space-y-8 ${active.length > 0 ? "mt-5" : ""}`}>
                  {past.map((term) => (
                    <TermSection key={term.id} term={term} offerings={byTerm(term)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TermSection({
  term,
  offerings,
}: {
  term: CourseTermRef;
  offerings: FacultyCourseSummary[];
}) {
  const status = termStatus(term);
  return (
    <section aria-labelledby={`term-${term.id}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={`term-${term.id}`} className="font-display text-base font-semibold text-gray-900">
          {term.name}
        </h2>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}
        >
          {TERM_STATUS_LABEL[status]}
        </span>
        <span className="text-sm text-gray-500">{formatTermDates(term)}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {offerings.map((o) => (
          <CourseCard key={o.id} offering={o} />
        ))}
      </div>
    </section>
  );
}

const TAB_ICON: Record<(typeof COURSE_TABS)[number], IconDefinition> = {
  progress: faChartColumn,
  grading: faPercent,
  skills: faBookMedical,
};

const TAB_LABEL: Record<(typeof COURSE_TABS)[number], string> = {
  progress: "Progress",
  grading: "Grading",
  skills: "Skills",
};

/**
 * The whole card opens the course (a stretched link under everything); the
 * next-step link and the tab links sit above it and open their own tab.
 */
function CourseCard({ offering: o }: { offering: FacultyCourseSummary }) {
  const status = termStatus(o.term);
  const noGroup = o.sections.filter((s) => !s.has_group);
  const toScore = o.progress?.to_score ?? 0;
  const next =
    o.requirement_count === 0 && status !== "ended"
      ? {
          tab: "grading" as const,
          icon: faPlus,
          text: "Set up the checklist",
          tone: "bg-brand-600/10 text-brand-800 hover:bg-brand-600/15",
        }
      : toScore > 0
        ? {
            tab: "progress" as const,
            icon: faPenToSquare,
            text: `${plural(toScore, "Lab Activity score")} to enter`,
            tone: "bg-teal-50 text-teal-800 hover:bg-teal-100",
          }
        : null;
  const note =
    o.progress || next
      ? null
      : status === "ended"
        ? "Term ended · checklist locked"
        : status === "upcoming"
          ? "The term hasn't started yet"
          : o.student_count === 0
            ? "No students yet"
            : null;

  return (
    <article
      className={`group relative flex flex-col rounded-2xl border border-hairline bg-surface shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200 focus-within:border-brand-600/40 hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-tile-hover ${
        status === "ended" ? "opacity-90" : ""
      }`}
    >
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={courseTabHref(o.id)}
              className="font-display text-lg font-semibold text-gray-900 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand-600/40"
            >
              {o.course.code}
            </Link>
            <p className="truncate text-sm text-gray-600">{o.course.title}</p>
          </div>
          <FontAwesomeIcon
            icon={faChevronRight}
            className="mt-1.5 h-3.5 w-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {o.sections.map((s) => (
            <span
              key={s.id}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                s.has_group
                  ? "bg-brand-600/10 text-brand-700"
                  : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
              }`}
            >
              {s.name}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
            {plural(o.student_count, "student")}
          </span>
        </div>

        {o.progress && <RosterBar summary={o.progress} />}
        {note && <p className="mt-4 text-xs text-gray-500">{note}</p>}

        {next && (
          <Link
            href={courseTabHref(o.id, next.tab)}
            className={`relative z-10 mt-4 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${next.tone}`}
          >
            <FontAwesomeIcon icon={next.icon} className="h-3.5 w-3.5" />
            {next.text}
            <FontAwesomeIcon icon={faArrowRight} className="ml-auto h-3 w-3" />
          </Link>
        )}
        {noGroup.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-700">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
            You have no group in {noGroup.map((s) => s.name).join(", ")}
          </p>
        )}
      </div>

      <nav
        aria-label={`${o.course.code} tabs`}
        className="relative z-10 grid grid-cols-3 border-t border-hairline"
      >
        {COURSE_TABS.map((t, i) => (
          <Link
            key={t}
            href={courseTabHref(o.id, t)}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-subtle hover:text-brand-700 ${
              i > 0 ? "border-l border-hairline" : ""
            } ${i === 0 ? "rounded-bl-2xl" : i === COURSE_TABS.length - 1 ? "rounded-br-2xl" : ""}`}
          >
            <FontAwesomeIcon icon={TAB_ICON[t]} className="h-3 w-3" />
            {TAB_LABEL[t]}
            {t === "grading" && o.requirement_count > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500">
                {o.requirement_count}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </article>
  );
}

/** The roster at a glance: met everything, partway, not started. */
function RosterBar({ summary: p }: { summary: OfferingSummary }) {
  // A cached response from before in_progress existed reads as nobody partway.
  const partway = p.in_progress ?? 0;
  const notStarted = Math.max(0, p.students - p.complete - partway);
  const width = (n: number) => `${p.students ? (n / p.students) * 100 : 0}%`;
  return (
    <div className="mt-4">
      <div
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-100"
        role="img"
        aria-label={`${p.complete} of ${p.students} students met every requirement, ${partway} partway, ${notStarted} not started`}
      >
        {p.complete > 0 && (
          <span className="rounded-full bg-emerald-500" style={{ width: width(p.complete) }} />
        )}
        {partway > 0 && (
          <span className="rounded-full bg-amber-400" style={{ width: width(partway) }} />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500" aria-hidden>
        <Count tone="bg-emerald-500" n={p.complete} label="complete" />
        <Count tone="bg-amber-400" n={partway} label="partway" />
        <Count tone="bg-gray-200" n={notStarted} label="not started" />
      </div>
    </div>
  );
}

function Count({ tone, n, label }: { tone: string; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      <span className="font-semibold text-gray-700">{n}</span> {label}
    </span>
  );
}
