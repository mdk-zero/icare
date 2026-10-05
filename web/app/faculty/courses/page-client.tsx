"use client";

import Link from "next/link";
import { SkeletonCourseCard, SkeletonTermHeading } from "../../components/skeletons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookMedical,
  faChevronRight,
  faListCheck,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import { usePageData } from "../../lib/use-page-data";
import { fetchMyCourses, type FacultyCourseSummary } from "../../lib/api";
import { TERM_STATUS_LABEL, formatTermDates, termStatus, type TermStatus } from "../../lib/course-progress";

const NO_COURSES: FacultyCourseSummary[] = [];

const STATUS_STYLE: Record<TermStatus, string> = {
  current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  upcoming: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ended: "bg-gray-100 text-gray-500 ring-gray-500/20",
};

const STATUS_ORDER: Record<TermStatus, number> = { current: 0, upcoming: 1, ended: 2 };

/**
 * The courses a Dean assigned to the signed-in instructor, grouped by term
 * (the running one first). Each opens its requirements checklist.
 */
export default function FacultyCoursesClient() {
  const { data, loading } = usePageData("faculty:courses", fetchMyCourses);
  const offerings = data?.data?.offerings ?? NO_COURSES;
  const error = data?.error ?? null;

  const terms = [...new Map(offerings.map((o) => [o.term.id, o.term])).values()].sort(
    (a, b) => STATUS_ORDER[termStatus(a)] - STATUS_ORDER[termStatus(b)] || b.starts_on.localeCompare(a.starts_on),
  );

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />, label: "Teaching" }}
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
          <p className="mt-1 text-sm text-gray-500">Your Dean assigns courses on their Courses page. They appear here once assigned.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {terms.map((term) => {
            const status = termStatus(term);
            return (
              <section key={term.id}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-gray-900">{term.name}</h2>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
                    {TERM_STATUS_LABEL[status]}
                  </span>
                  <span className="text-sm text-gray-500">{formatTermDates(term)}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {offerings
                    .filter((o) => o.term.id === term.id)
                    .map((o) => (
                      <CourseCard key={o.id} offering={o} />
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseCard({ offering: o }: { offering: FacultyCourseSummary }) {
  const noGroup = o.sections.filter((s) => !s.has_group);
  return (
    <Link
      href={`/faculty/courses/${o.id}`}
      className="group flex flex-col rounded-2xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-tile-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-gray-900">{o.course.code}</p>
          <p className="truncate text-sm text-gray-600">{o.course.title}</p>
        </div>
        <FontAwesomeIcon icon={faChevronRight} className="mt-1.5 h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-brand-600" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.sections.map((s) => (
          <span
            key={s.id}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              s.has_group ? "bg-brand-600/10 text-brand-700" : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
            }`}
          >
            {s.name}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-4 pt-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-gray-400" />
          {o.student_count} student{o.student_count === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5 text-gray-400" />
          {o.requirement_count === 0 ? "No checklist yet" : `${o.requirement_count} requirement${o.requirement_count === 1 ? "" : "s"}`}
        </span>
      </div>
      {o.progress && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-gray-500">Students who met every requirement</span>
            <span className="font-semibold text-gray-800">
              {o.progress.complete} of {o.progress.students}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${o.progress.students ? (o.progress.complete / o.progress.students) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {noGroup.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
          You have no group in {noGroup.map((s) => s.name).join(", ")}
        </p>
      )}
    </Link>
  );
}
