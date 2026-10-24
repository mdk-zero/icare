"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookMedical,
  faCalendarDays,
  faChalkboardUser,
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
  deleteCourse,
  deleteCourseOffering,
  deleteTerm,
  fetchCourseImpact,
  fetchOfferingImpact,
  fetchTermImpact,
  saveDeanCourseSkills,
  suggestDeanCourseSkills,
  type AcademicTerm,
  type CourseOfferingRow,
  type CourseSummary,
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
} from "./modals";
import { NO_DATA, NO_INSTRUCTORS, loadDeanCourses } from "./load";
import CourseBrowser from "./course-browser";

const STATUS_STYLE: Record<TermStatus, string> = {
  current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  upcoming: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ended: "bg-gray-100 text-gray-500 ring-gray-500/20",
};


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
  const router = useRouter();
  const [termFilter, setTermFilter] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const { data, loading, refresh } = usePageData("admin:courses", loadDeanCourses);

  const { terms, courses, offerings } = data?.courses ?? NO_DATA;
  const instructors = data?.instructors ?? NO_INSTRUCTORS;
  const loadError = data?.error ?? null;

  const selectedTerm = termFilter ?? defaultTerm(terms);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const termRow = terms.find((t) => t.id === selectedTerm) ?? null;
  const termOverlaps = termRow ? terms.filter((o) => o.id !== termRow.id && termsOverlap(o, termRow)) : [];
  const current = terms.find((t) => termStatus(t) === "current");

  const closeAndReload = async () => {
    setDialog(null);
    await refresh();
  };


  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />, label: "Curriculum" }}
        title="Courses"
        subtitle="Your terms and courses, and which instructors teach them"
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

      {/* One view: the term, then its courses. A plain row, like the Instructors and Students filters. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* The action first, then the term. Assign Course adds the term and the course as it goes. */}
        <button
          type="button"
          onClick={() => router.push("/dean/courses/new")}
          aria-label="Assign a course to an instructor"
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700"
        >
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          Assign Course
        </button>
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
        {termRow && (
          <>
            <StatusBadge status={termStatus(termRow)} />
            <span className="text-sm text-gray-600">{formatTermDates(termRow)}</span>
            {termOverlaps.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                Overlaps {termOverlaps.map((o) => o.name).join(", ")}
              </span>
            )}
            <div className="ml-auto">
              <ActionsMenu
                variant="compact"
                label={`Actions for ${termRow.name}`}
                actions={[
                  { label: "Edit term", icon: faPenToSquare, onClick: () => setDialog({ kind: "term", term: termRow }) },
                  { label: "Delete term", icon: faTrashCan, danger: true, onClick: () => setDialog({ kind: "deleteTerm", term: termRow }) },
                ]}
              />
            </div>
          </>
        )}
    </div>

      {/* The term's courses as cards: a course opens on its sections, a section on its instructors and skills. */}
      <CourseBrowser
        key={selectedTerm}
        term={termRow}
        courses={courses}
        offerings={offerings}
        loading={loading}
        actions={{
          editCourse: (course) => setDialog({ kind: "course", course }),
          editSkills: (course) => setDialog({ kind: "skills", course }),
          deleteCourse: (course) => setDialog({ kind: "deleteCourse", course }),
          changeInstructor: (offering) => setDialog({ kind: "assign", offering }),
          removeOffering: (offering) => setDialog({ kind: "unassign", offering }),
        }}
      />

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

