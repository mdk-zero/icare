"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookMedical,
  faCalendarDays,
  faChalkboardUser,
  faListCheck,
  faPenToSquare,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import FilterSelect from "../../components/FilterSelect";
import StatTile from "../../components/StatTile";
import ActionsMenu from "../../components/ActionsMenu";
import CourseSkillsModal from "../../components/CourseSkillsModal";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import {
  apiFetch,
  deleteCourse,
  deleteCourseOffering,
  deleteTerm,
  fetchCourseImpact,
  fetchDeanCourses,
  fetchOfferingImpact,
  fetchSections,
  fetchTermImpact,
  saveDeanCourseSkills,
  suggestDeanCourseSkills,
  type AcademicTerm,
  type CourseOfferingRow,
  type CourseSummary,
  type DeanCourses,
  type Section,
} from "../../lib/api";
import {
  TERM_STATUS_LABEL,
  formatTermDates,
  termStatus,
  termsOverlap,
  type TermStatus,
} from "../../lib/course-progress";
import {
  AssignmentModal,
  CourseFormModal,
  DeleteImpactModal,
  TermFormModal,
  type InstructorOption,
} from "./modals";

type Tab = "assignments" | "courses" | "terms";

const TABS: { id: Tab; label: string; icon: typeof faBookMedical }[] = [
  { id: "assignments", label: "Assignments", icon: faChalkboardUser },
  { id: "courses", label: "Courses", icon: faBookMedical },
  { id: "terms", label: "Terms", icon: faCalendarDays },
];

const NO_DATA: DeanCourses = { terms: [], courses: [], offerings: [] };
const NO_INSTRUCTORS: InstructorOption[] = [];
const NO_SECTIONS: Section[] = [];

const STATUS_STYLE: Record<TermStatus, string> = {
  current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  upcoming: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ended: "bg-gray-100 text-gray-500 ring-gray-500/20",
};

const thClass = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500";
const cardClass =
  "overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]";

function StatusBadge({ status }: { status: TermStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {TERM_STATUS_LABEL[status]}
    </span>
  );
}

/** The term the Assignments tab opens on: the current one, else the latest. */
function defaultTerm(terms: AcademicTerm[]): string {
  return (terms.find((t) => termStatus(t) === "current") ?? terms[0])?.id ?? "";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Instructors' ticks, marks and entered scores, as the delete dialogs count them. */
const entriesPhrase = (n: number) => plural(n, "instructor score or tick", "instructor scores and ticks");

type Dialog =
  | { kind: "course"; course: CourseSummary | null }
  | { kind: "skills"; course: CourseSummary }
  | { kind: "deleteCourse"; course: CourseSummary }
  | { kind: "term"; term: AcademicTerm | null }
  | { kind: "deleteTerm"; term: AcademicTerm }
  | { kind: "assign"; offering: CourseOfferingRow | null }
  | { kind: "unassign"; offering: CourseOfferingRow };

export default function CoursesClient() {
  const [tab, setTab] = useState<Tab>("assignments");
  const [termFilter, setTermFilter] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const { data, loading, refresh } = usePageData("admin:courses", async () => {
    const [courses, facultyRes, sections] = await Promise.all([
      fetchDeanCourses(),
      apiFetch("/api/admin/faculty", { credentials: "include" }),
      fetchSections(),
    ]);
    const instructors = facultyRes.ok
      ? ((await facultyRes.json()) as { faculty?: InstructorOption[] }).faculty ?? NO_INSTRUCTORS
      : NO_INSTRUCTORS;
    return {
      courses: courses.data ?? NO_DATA,
      error: courses.error ?? null,
      instructors,
      sections,
    };
  });

  const { terms, courses, offerings } = data?.courses ?? NO_DATA;
  const instructors = data?.instructors ?? NO_INSTRUCTORS;
  const sections = data?.sections ?? NO_SECTIONS;
  const loadError = data?.error ?? null;

  const selectedTerm = termFilter ?? defaultTerm(terms);
  const termOfferings = useMemo(
    () => offerings.filter((o) => o.term_id === selectedTerm),
    [offerings, selectedTerm],
  );
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const current = terms.find((t) => termStatus(t) === "current");

  const closeAndReload = async () => {
    setDialog(null);
    await refresh();
  };

  const headerAction = {
    assignments: {
      onClick: () => setDialog({ kind: "assign", offering: null }),
      label: "Assign a course to an instructor",
      text: "Assign Course",
      disabled: terms.length === 0 || courses.length === 0,
    },
    courses: {
      onClick: () => setDialog({ kind: "course", course: null }),
      label: "Add a course",
      text: "Add Course",
      disabled: false,
    },
    terms: {
      onClick: () => setDialog({ kind: "term", term: null }),
      label: "Add an academic term",
      text: "Add Term",
      disabled: false,
    },
  }[tab];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />, label: "Curriculum" }}
        title="Courses"
        subtitle="Your terms and courses, and which instructors teach them"
        action={{ icon: <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />, ...headerAction }}
      />

      {loadError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
          <button onClick={() => setWarnings([])} className="shrink-0 font-medium text-amber-700 hover:text-amber-900">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={faBookMedical} value={courses.length} label="Courses" />
        <StatTile
          icon={faCalendarDays}
          value={terms.length}
          label="Terms"
          caption={current ? `Current: ${current.name}` : "No term is running today"}
        />
        <StatTile
          icon={faChalkboardUser}
          value={current ? offerings.filter((o) => o.term_id === current.id).length : 0}
          label="Assignments this term"
        />
      </div>

      <div
        role="tablist"
        aria-label="Courses sections"
        className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-hairline)]"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              <FontAwesomeIcon icon={t.icon} className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "assignments" && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <FilterSelect
              value={selectedTerm}
              onChange={(e) => setTermFilter(e.target.value)}
              aria-label="Term"
              disabled={terms.length === 0}
            >
              {terms.length === 0 && <option value="">No terms yet</option>}
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {TERM_STATUS_LABEL[termStatus(t)]}
                </option>
              ))}
            </FilterSelect>
            {terms.length === 0 || courses.length === 0 ? (
              <p className="text-sm text-gray-500">
                {terms.length === 0 ? "Add a term first (Terms tab)." : "Add a course first (Courses tab)."}
              </p>
            ) : null}
          </div>
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-subtle">
                  <tr>
                    <th className={thClass}>Course</th>
                    <th className={thClass}>Instructor</th>
                    <th className={thClass}>Sections</th>
                    <th className={thClass}>Students</th>
                    <th className={thClass}>Checklist</th>
                    <th className={thClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <SkeletonRows cols={6} />
                  ) : termOfferings.length === 0 ? (
                    <EmptyRow cols={6}>
                      {terms.length === 0
                        ? "No terms yet."
                        : "No courses are assigned in this term yet. Use Assign Course to give one to an instructor."}
                    </EmptyRow>
                  ) : (
                    termOfferings.map((o) => {
                      const course = courseById.get(o.course_id);
                      return (
                        <tr key={o.id} className="hover:bg-subtle">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{course?.code ?? "Course"}</p>
                            <p className="text-sm text-gray-500">{course?.title}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800">
                            {o.faculty_name ?? <span className="text-amber-700">No instructor</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {o.sections.map((s) => (
                                <span
                                  key={s.id}
                                  title={s.has_group ? undefined : "The instructor supervises no group here, so no students come from it"}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                    s.has_group ? "bg-brand-600/10 text-brand-700" : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
                                  }`}
                                >
                                  {!s.has_group && <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />}
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800">{o.student_count}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {o.requirement_count === 0 ? "Not set up" : plural(o.requirement_count, "item")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ActionsMenu
                              variant="compact"
                              label={`Actions for ${course?.code ?? "assignment"}`}
                              actions={[
                                { label: "Edit", icon: faPenToSquare, onClick: () => setDialog({ kind: "assign", offering: o }) },
                                { label: "Remove", icon: faTrashCan, danger: true, onClick: () => setDialog({ kind: "unassign", offering: o }) },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "courses" && (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-100 bg-subtle">
                <tr>
                  <th className={thClass}>Course</th>
                  <th className={thClass}>Skills</th>
                  <th className={thClass}>Assignments</th>
                  <th className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <SkeletonRows cols={4} />
                ) : courses.length === 0 ? (
                  <EmptyRow cols={4}>No courses yet. Add your first one with Add Course.</EmptyRow>
                ) : (
                  courses.map((c) => (
                    <tr key={c.id} className="hover:bg-subtle">
                      <td className="max-w-md px-4 py-3">
                        <p className="font-semibold text-gray-800">
                          {c.code} <span className="font-normal text-gray-600">· {c.title}</span>
                        </p>
                        {c.description && <p className="line-clamp-2 text-sm text-gray-500">{c.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "skills", course: c })}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                            c.skill_ids.length > 0
                              ? "bg-brand-600/10 text-brand-700 hover:bg-brand-600/15"
                              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          }`}
                        >
                          <FontAwesomeIcon icon={faListCheck} className="h-3 w-3" />
                          {c.skill_ids.length > 0 ? plural(c.skill_ids.length, "skill") : "Pick skills"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{c.offering_count}</td>
                      <td className="px-4 py-3 text-right">
                        <ActionsMenu
                          variant="compact"
                          label={`Actions for ${c.code}`}
                          actions={[
                            { label: "Edit details", icon: faPenToSquare, onClick: () => setDialog({ kind: "course", course: c }) },
                            { label: "Edit skills", icon: faListCheck, onClick: () => setDialog({ kind: "skills", course: c }) },
                            { label: "Delete", icon: faTrashCan, danger: true, onClick: () => setDialog({ kind: "deleteCourse", course: c }) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "terms" && (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-100 bg-subtle">
                <tr>
                  <th className={thClass}>Term</th>
                  <th className={thClass}>Dates</th>
                  <th className={thClass}>Assignments</th>
                  <th className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <SkeletonRows cols={4} />
                ) : terms.length === 0 ? (
                  <EmptyRow cols={4}>No terms yet. Add the current semester with Add Term.</EmptyRow>
                ) : (
                  terms.map((t) => {
                    const overlaps = terms.filter((o) => o.id !== t.id && termsOverlap(o, t));
                    return (
                      <tr key={t.id} className="hover:bg-subtle">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-800">{t.name}</span>
                            <StatusBadge status={termStatus(t)} />
                          </div>
                          {overlaps.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700">
                              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                              Overlaps {overlaps.map((o) => o.name).join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatTermDates(t)}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{t.offering_count}</td>
                        <td className="px-4 py-3 text-right">
                          <ActionsMenu
                            variant="compact"
                            label={`Actions for ${t.name}`}
                            actions={[
                              { label: "Edit", icon: faPenToSquare, onClick: () => setDialog({ kind: "term", term: t }) },
                              { label: "Delete", icon: faTrashCan, danger: true, onClick: () => setDialog({ kind: "deleteTerm", term: t }) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialog?.kind === "course" && (
        <CourseFormModal course={dialog.course} courses={courses} onClose={() => setDialog(null)} onSaved={closeAndReload} />
      )}
      {dialog?.kind === "skills" && (
        <CourseSkillsModal
          course={dialog.course}
          initial={dialog.course.skill_ids}
          onSuggest={() => suggestDeanCourseSkills(dialog.course.id)}
          onSave={(ids, aiIds) => saveDeanCourseSkills(dialog.course.id, ids, aiIds)}
          onClose={() => setDialog(null)}
          onSaved={closeAndReload}
        />
      )}
      {dialog?.kind === "deleteCourse" && (
        <DeleteImpactModal
          title={`Delete ${dialog.course.code}?`}
          loadImpact={() => fetchCourseImpact(dialog.course.id)}
          describe={(i) => [
            i.offering_count === 0
              ? "No instructor is assigned this course."
              : `${plural(i.offering_count, "course assignment")} and ${plural(i.requirement_count, "checklist item")} are removed.`,
            ...(i.check_count > 0 ? [`${entriesPhrase(i.check_count)} on students' checklists are removed.`] : []),
            "Graded Patient Cases, Quizzes and Case Presentations are not touched.",
          ]}
          keepLabel="Keep course"
          confirmLabel={`Delete ${dialog.course.code}`}
          onDelete={() => deleteCourse(dialog.course.id)}
          onClose={() => setDialog(null)}
          onDeleted={closeAndReload}
        />
      )}
      {dialog?.kind === "term" && (
        <TermFormModal term={dialog.term} terms={terms} onClose={() => setDialog(null)} onSaved={closeAndReload} />
      )}
      {dialog?.kind === "deleteTerm" && (
        <DeleteImpactModal
          title={`Delete ${dialog.term.name}?`}
          loadImpact={() => fetchTermImpact(dialog.term.id)}
          describe={(i) => [
            i.offering_count === 0
              ? "No course is assigned in this term."
              : `${plural(i.offering_count, "course assignment")} and ${plural(i.requirement_count, "checklist item")} in this term are removed.`,
            "Your courses and all graded work are kept.",
          ]}
          keepLabel="Keep term"
          confirmLabel={`Delete ${dialog.term.name}`}
          onDelete={async () => {
            const result = await deleteTerm(dialog.term.id);
            if (result.error === undefined && termFilter === dialog.term.id) setTermFilter(null);
            return result;
          }}
          onClose={() => setDialog(null)}
          onDeleted={closeAndReload}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignmentModal
          offering={dialog.offering}
          defaultTermId={selectedTerm}
          terms={terms}
          courses={courses}
          offerings={offerings}
          instructors={instructors}
          sections={sections}
          onClose={() => setDialog(null)}
          onSaved={async (next) => {
            setWarnings(next);
            if (next.length === 0) toast("Course assignment saved");
            await closeAndReload();
          }}
        />
      )}
      {dialog?.kind === "unassign" && (
        <DeleteImpactModal
          title={`Remove ${courseById.get(dialog.offering.course_id)?.code ?? "this assignment"} from ${dialog.offering.faculty_name ?? "the instructor"}?`}
          loadImpact={() => fetchOfferingImpact(dialog.offering.id)}
          describe={(i) => [
            i.requirement_count === 0
              ? "The instructor has not set up a checklist for it yet."
              : `Its checklist of ${plural(i.requirement_count, "item")} is removed${i.check_count > 0 ? `, with ${entriesPhrase(i.check_count)}` : ""}.`,
            "Graded work is not touched.",
          ]}
          keepLabel="Keep assignment"
          confirmLabel="Remove assignment"
          onDelete={() => deleteCourseOffering(dialog.offering.id)}
          onClose={() => setDialog(null)}
          onDeleted={closeAndReload}
        />
      )}
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="animate-pulse" aria-hidden>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`h-4 rounded bg-gray-100 ${j === 0 ? "w-40" : "w-16"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-sm text-gray-400">
        {children}
      </td>
    </tr>
  );
}
