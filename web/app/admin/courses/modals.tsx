"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBookMedical,
  faCalendarDays,
  faChalkboardUser,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  createCourse,
  createCourseOffering,
  createTerm,
  updateCourse,
  updateCourseOffering,
  updateTerm,
  type AcademicTerm,
  type CourseOfferingRow,
  type CourseSummary,
} from "../../lib/api";
import {
  NCM_LAB_COURSES,
  SEMESTERS,
  academicYearOptions,
  currentAcademicYear,
  curriculumGroups,
  defaultTermDates,
  parseTermName,
  sameCode,
  termName,
  type Semester,
} from "../../lib/bsn-curriculum";
import { COURSE_LIMITS, formatTermDates, termsOverlap } from "../../lib/course-progress";
import { EcgLoader } from "../../components/EcgLoader";
import { loadingToast } from "../../components/Toast";

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export interface InstructorOption {
  id: string;
  name: string;
  groups: { id: string; name: string; section_id: string; section_name: string }[];
}

export const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-4 py-2.5 text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60";
export const labelClass = "mb-1.5 block text-sm font-semibold text-gray-700";

function ModalFrame({
  icon,
  tone = "brand",
  title,
  subtitle,
  busy,
  onClose,
  children,
  wide,
}: {
  icon: IconDefinition;
  tone?: "brand" | "danger";
  title: string;
  subtitle: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${wide ? "max-w-xl" : "max-w-md"} flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                tone === "danger" ? "bg-rose-100" : "bg-brand-600/10"
              }`}
            >
              <FontAwesomeIcon
                icon={icon}
                className={`h-5 w-5 ${tone === "danger" ? "text-rose-600" : "text-brand-600"}`}
              />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold text-gray-900">{title}</h2>
              <p className="truncate text-sm text-gray-500">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  busy,
  onClose,
  submitLabel,
  disabled,
  danger,
  onSubmit,
  cancelLabel = "Cancel",
}: {
  busy: boolean;
  onClose: () => void;
  submitLabel: string;
  disabled?: boolean;
  danger?: boolean;
  /** Without it the button submits the surrounding form. */
  onSubmit?: () => void;
  cancelLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        type={onSubmit ? "button" : "submit"}
        onClick={onSubmit}
        disabled={busy || disabled}
        className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60 ${
          danger
            ? "bg-rose-600 shadow-[0_2px_8px_-1px_rgb(225_29_72_/_0.35)] hover:bg-rose-700"
            : "bg-brand-600 shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] hover:bg-brand-700"
        }`}
      >
        {busy && <EcgLoader />}
        {submitLabel}
      </button>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>;
}

const normalizeCode = (code: string) => code.trim().replace(/\s+/g, " ").toLowerCase();

/** The term a semester and academic year name, if there is one already. */
export const findTerm = (terms: AcademicTerm[], semester: Semester, year: number) =>
  terms.find((t) => {
    const parsed = parseTermName(t.name);
    return parsed ? parsed.semester === semester && parsed.startYear === year : normalizeCode(t.name) === normalizeCode(termName(semester, year));
  }) ?? null;

/** Where a new term sits: the open one, else by today's month. */
export function startingTerm(terms: AcademicTerm[], termId: string | null | undefined): { semester: Semester; year: number } {
  const parsed = parseTermName(terms.find((t) => t.id === termId)?.name ?? "");
  if (parsed) return { semester: parsed.semester, year: parsed.startYear };
  const month = new Date().getMonth();
  return { semester: month >= 7 ? "first" : month <= 4 ? "second" : "midterm", year: currentAcademicYear() };
}

/** Semester and academic year, from lists: terms are never typed. */
export function TermPicker({
  semester,
  year,
  years,
  onChange,
  disabled,
  idPrefix,
}: {
  semester: Semester;
  year: number;
  years: number[];
  onChange: (next: { semester: Semester; year: number }) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-semester`} className={labelClass}>
          Semester <span className="text-rose-500">*</span>
        </label>
        <select
          id={`${idPrefix}-semester`}
          value={semester}
          onChange={(e) => onChange({ semester: e.target.value as Semester, year })}
          disabled={disabled}
          className={inputClass}
        >
          {SEMESTERS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-year`} className={labelClass}>
          Academic year <span className="text-rose-500">*</span>
        </label>
        <select
          id={`${idPrefix}-year`}
          value={year}
          onChange={(e) => onChange({ semester, year: Number(e.target.value) })}
          disabled={disabled}
          className={inputClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              AY {y}–{y + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** The curriculum's NCM lab courses, grouped by year level and semester. */
export function CoursePicker({
  id,
  value,
  onChange,
  disabled,
  taken,
  existing,
  semester,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Codes that can't be picked here, shown as already added. */
  taken?: (code: string) => boolean;
  /** Courses already added that aren't in the curriculum list, so they can be picked too. */
  existing?: { code: string; title: string }[];
  /** Only the curriculum's courses for this semester; all of them for Midterm or when left out. */
  semester?: Semester;
}) {
  const semesterNo = semester === "first" ? 1 : semester === "second" ? 2 : null;
  const others = (existing ?? []).filter((c) => !NCM_LAB_COURSES.some((x) => sameCode(x.code, c.code)));
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
      <option value="">Choose a course</option>
      {curriculumGroups()
        .map((g) => ({ ...g, courses: g.courses.filter((c) => semesterNo === null || c.semester === semesterNo) }))
        .filter((g) => g.courses.length > 0)
        .map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.courses.map((c) => (
            <option key={c.code} value={c.code} disabled={taken?.(c.code)}>
              {c.code} · {c.title}
              {taken?.(c.code) ? " (already added)" : ""}
            </option>
          ))}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label="Your other courses">
          {others.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.title}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** Start and end dates, with the overlap note. */
export function TermDates({
  startsOn,
  endsOn,
  onChange,
  terms,
  exceptId,
  disabled,
  idPrefix,
}: {
  startsOn: string;
  endsOn: string;
  onChange: (next: { starts_on: string; ends_on: string }) => void;
  terms: AcademicTerm[];
  exceptId?: string;
  disabled?: boolean;
  idPrefix: string;
}) {
  const valid = startsOn !== "" && endsOn !== "" && endsOn >= startsOn;
  const overlapping = valid
    ? terms.filter((t) => t.id !== exceptId && termsOverlap(t, { starts_on: startsOn, ends_on: endsOn }))
    : [];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-start`} className={labelClass}>
            Starts <span className="text-rose-500">*</span>
          </label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            value={startsOn}
            onChange={(e) => onChange({ starts_on: e.target.value, ends_on: endsOn })}
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-end`} className={labelClass}>
            Ends <span className="text-rose-500">*</span>
          </label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(e) => onChange({ starts_on: startsOn, ends_on: e.target.value })}
            disabled={disabled}
            className={inputClass}
          />
        </div>
      </div>
      {startsOn && endsOn && endsOn < startsOn && (
        <p className="text-xs text-rose-600">The term must end on or after its start date.</p>
      )}
      {overlapping.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {`Overlaps ${overlapping.map((t) => `${t.name} (${formatTermDates(t)})`).join(", ")}. That is allowed, but work graded in the overlap counts for both terms.`}
          </span>
        </p>
      )}
    </>
  );
}

export function CourseFormModal({
  course,
  courses,
  onClose,
  onSaved,
}: {
  course: CourseSummary | null;
  courses: CourseSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // A new course is picked from the curriculum; an existing one keeps its code and title.
  const [code, setCode] = useState(course?.code ?? "");
  const picked = NCM_LAB_COURSES.find((c) => sameCode(c.code, code));
  const title = course?.title ?? picked?.title ?? "";
  const [description, setDescription] = useState(course?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = (c: string) => courses.some((x) => x.id !== course?.id && normalizeCode(x.code) === normalizeCode(c));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      setError("Choose a course.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = { code: code.trim(), title: title.trim(), description: description.trim() };
    const progress = loadingToast(course ? `Saving ${input.code}…` : `Adding ${input.code}…`);
    const result: Result<unknown> = course ? await updateCourse(course.id, input) : await createCourse(input);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(course ? `${input.code} saved` : `${input.code} added`);
    onSaved();
  };

  return (
    <ModalFrame
      icon={faBookMedical}
      title={course ? `Edit ${course.code}` : "New course"}
      subtitle={course ? course.title : "A course from the BSN curriculum your instructors can teach"}
      busy={saving}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        {course ? (
          <div className="rounded-xl border border-hairline bg-subtle px-4 py-3">
            <p className="font-mono text-xs font-semibold text-brand-700">{course.code}</p>
            <p className="text-sm font-medium text-gray-800">{course.title}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="course-code" className={labelClass}>
              Course <span className="text-rose-500">*</span>
            </label>
            <CoursePicker id="course-code" value={code} onChange={setCode} disabled={saving} taken={taken} />
            <p className="mt-1.5 text-xs text-gray-500">The NCM laboratory courses of the BSN curriculum.</p>
          </div>
        )}
        <div>
          <label htmlFor="course-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="course-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={COURSE_LIMITS.courseDescription}
            disabled={saving}
            rows={4}
            placeholder="What the course covers. Detect with AI reads this to find the course's skills."
            className={`${inputClass} resize-y`}
          />
        </div>
        <ErrorNote error={error} />
        <ModalActions
          busy={saving}
          onClose={onClose}
          submitLabel={course ? "Save course" : "Add course"}
          disabled={!code.trim() || !title.trim() || (!course && taken(code))}
        />
      </form>
    </ModalFrame>
  );
}

export function TermFormModal({
  term,
  terms,
  onClose,
  onSaved,
}: {
  term: AcademicTerm | null;
  terms: AcademicTerm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const start = startingTerm(terms, term?.id);
  const [semester, setSemester] = useState<Semester>(start.semester);
  const [year, setYear] = useState(start.year);
  const [dates, setDates] = useState(() =>
    term ? { starts_on: term.starts_on, ends_on: term.ends_on } : defaultTermDates(start.semester, start.year),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = termName(semester, year);
  const years = academicYearOptions(terms.map((t) => parseTermName(t.name)?.startYear ?? 0).filter(Boolean));
  const datesValid = dates.starts_on !== "" && dates.ends_on !== "" && dates.ends_on >= dates.starts_on;
  const existing = findTerm(terms, semester, year);
  const duplicate = existing !== null && existing.id !== term?.id;

  const pick = (next: { semester: Semester; year: number }) => {
    setSemester(next.semester);
    setYear(next.year);
    // A new term follows the usual dates for what was picked.
    if (!term) setDates(defaultTermDates(next.semester, next.year));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datesValid) {
      setError("The term must end on or after its start date.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = { name, ...dates };
    const progress = loadingToast(term ? `Saving ${name}…` : `Adding ${name}…`);
    const result: Result<unknown> = term ? await updateTerm(term.id, input) : await createTerm(input);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(term ? `${name} saved` : `${name} added`);
    onSaved();
  };

  return (
    <ModalFrame
      icon={faCalendarDays}
      title={term ? `Edit ${term.name}` : "New term"}
      subtitle="Only work graded within these dates counts toward requirements"
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        <TermPicker semester={semester} year={year} years={years} onChange={pick} disabled={saving} idPrefix="term" />
        <p className="text-xs text-gray-500">
          Named <span className="font-semibold text-gray-700">{name}</span>.
        </p>
        {duplicate && <p className="text-xs text-amber-600">You already have this term.</p>}
        <TermDates
          startsOn={dates.starts_on}
          endsOn={dates.ends_on}
          onChange={setDates}
          terms={terms}
          exceptId={term?.id}
          disabled={saving}
          idPrefix="term"
        />
        {term && term.offering_count > 0 && (
          <p className="rounded-lg border border-hairline bg-subtle p-2.5 text-xs text-gray-500">
            {`Changing the dates re-checks the requirements of ${term.offering_count} course assignment${term.offering_count === 1 ? "" : "s"} right away.`}
          </p>
        )}
        <ErrorNote error={error} />
        <ModalActions
          busy={saving}
          onClose={onClose}
          submitLabel={term ? "Save term" : "Add term"}
          disabled={!datesValid || duplicate}
        />
      </form>
    </ModalFrame>
  );
}

/**
 * One flow: the term (semester and academic year), the course (from the
 * curriculum) and the instructor. A term or course that doesn't exist yet is
 * added as part of saving, so there's nothing to set up first. The instructor
 * adds the sections they teach it in.
 */
export function AssignmentModal({
  offering,
  defaultTermId,
  terms,
  courses,
  offerings,
  instructors,
  onClose,
  onSaved,
}: {
  offering: CourseOfferingRow | null;
  defaultTermId: string;
  terms: AcademicTerm[];
  courses: CourseSummary[];
  offerings: CourseOfferingRow[];
  instructors: InstructorOption[];
  onClose: () => void;
  onSaved: (warnings: string[]) => void;
}) {
  const start = startingTerm(terms, offering?.term_id ?? defaultTermId);
  const [semester, setSemester] = useState<Semester>(start.semester);
  const [year, setYear] = useState(start.year);
  const [dates, setDates] = useState(() => defaultTermDates(start.semester, start.year));
  const [code, setCode] = useState(courses.find((c) => c.id === offering?.course_id)?.code ?? "");
  const [facultyId, setFacultyId] = useState(offering?.faculty_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = academicYearOptions(terms.map((t) => parseTermName(t.name)?.startYear ?? 0).filter(Boolean));
  const name = termName(semester, year);
  const editTerm = offering ? (terms.find((t) => t.id === offering.term_id) ?? null) : null;
  const term = editTerm ?? findTerm(terms, semester, year);
  const course = courses.find((c) => sameCode(c.code, code)) ?? null;
  const fromCurriculum = NCM_LAB_COURSES.find((c) => sameCode(c.code, code)) ?? null;
  const instructor = instructors.find((f) => f.id === facultyId) ?? null;
  const datesValid = dates.starts_on !== "" && dates.ends_on !== "" && dates.ends_on >= dates.starts_on;

  const clash = offerings.find(
    (o) =>
      o.id !== offering?.id && term && course && o.course_id === course.id && o.term_id === term.id && o.faculty_id === facultyId,
  );

  const pick = (next: { semester: Semester; year: number }) => {
    setSemester(next.semester);
    setYear(next.year);
    setDates(defaultTermDates(next.semester, next.year));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !facultyId) {
      setError("Choose a course and an instructor.");
      return;
    }
    if (!term && !datesValid) {
      setError("Set when the term starts and ends.");
      return;
    }
    setSaving(true);
    setError(null);
    const label = `${code} for ${instructor?.name ?? "the instructor"}`;
    const progress = loadingToast(offering ? `Saving ${label}…` : `Assigning ${label}…`);
    const fail = (message: string) => {
      setSaving(false);
      progress.error(message);
      setError(message);
    };

    if (offering) {
      // The sections stay as the instructor set them.
      const result = await updateCourseOffering(offering.id, {
        faculty_id: facultyId,
        section_ids: offering.sections.map((s) => s.id),
      });
      if (result.error !== undefined) return fail(result.error);
      setSaving(false);
      progress.success("Assignment saved");
      onSaved(result.data.warnings ?? []);
      return;
    }

    // The term and the course are added first when they're new.
    let termId = term?.id ?? null;
    if (!termId) {
      const made = await createTerm({ name, ...dates });
      if (made.error !== undefined) return fail(made.error);
      termId = made.data.term.id;
    }
    let courseId = course?.id ?? null;
    if (!courseId) {
      const made = await createCourse({ code, title: fromCurriculum?.title ?? code, description: "" });
      if (made.error !== undefined) return fail(made.error);
      courseId = made.data.course.id;
    }
    const result = await createCourseOffering({ course_id: courseId, term_id: termId, faculty_id: facultyId, section_ids: [] });
    if (result.error !== undefined) return fail(result.error);
    setSaving(false);
    progress.success(`Assigned ${label}`);
    onSaved(result.data.warnings ?? []);
  };

  return (
    <ModalFrame
      icon={faChalkboardUser}
      title={offering ? `Edit ${code || "assignment"}` : "Assign a course"}
      subtitle={
        offering
          ? `${editTerm?.name ?? "Term"} · the checklist stays with the assignment`
          : "The term, the course and who teaches it, in one go"
      }
      busy={saving}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        {offering ? (
          <div className="rounded-xl border border-hairline bg-subtle px-4 py-3">
            <p className="text-xs text-gray-500">{editTerm?.name}</p>
            <p className="text-sm font-medium text-gray-800">
              {code} · {course?.title}
            </p>
          </div>
        ) : (
          <>
            <TermPicker semester={semester} year={year} years={years} onChange={pick} disabled={saving} idPrefix="assign" />
            {!term && (
              <div className="space-y-3 rounded-xl border border-dashed border-brand-600/30 bg-brand-600/5 p-3">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">{name}</span>{" "}is new: it&apos;s added when you assign.
                  Check its dates.
                </p>
                <TermDates
                  startsOn={dates.starts_on}
                  endsOn={dates.ends_on}
                  onChange={setDates}
                  terms={terms}
                  disabled={saving}
                  idPrefix="assign"
                />
              </div>
            )}
            <div>
              <label htmlFor="assign-course" className={labelClass}>
                Course <span className="text-rose-500">*</span>
              </label>
              <CoursePicker id="assign-course" value={code} onChange={setCode} disabled={saving} />
              {code && !course && (
                <p className="mt-1.5 text-xs text-gray-500">Not in your courses yet: it&apos;s added when you assign.</p>
              )}
            </div>
          </>
        )}
        <div>
          <label htmlFor="assign-instructor" className={labelClass}>
            Instructor <span className="text-rose-500">*</span>
          </label>
          <select
            id="assign-instructor"
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            disabled={saving}
            className={inputClass}
          >
            <option value="">Choose an instructor</option>
            {instructors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {clash && (
            <p className="mt-1.5 text-xs text-amber-600">
              {instructor?.name ?? "This instructor"} already teaches this course in this term. Edit that assignment instead.
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            The instructor adds the sections they teach it in. Students come from their groups in each section, or the
            whole section where they have no group.
          </p>
        </div>
        <ErrorNote error={error} />
        <ModalActions
          busy={saving}
          onClose={onClose}
          submitLabel={offering ? "Save assignment" : "Assign course"}
          disabled={!code || !facultyId || !!clash || (!offering && !term && !datesValid)}
        />
      </form>
    </ModalFrame>
  );
}

/**
 * A delete that first shows what goes with it. The impact lives in the
 * database, so it arrives after mount.
 */
export function DeleteImpactModal<T>({
  title,
  loadImpact,
  describe,
  keepLabel,
  confirmLabel,
  onDelete,
  onClose,
  onDeleted,
}: {
  title: string;
  loadImpact: () => Promise<Result<T>>;
  describe: (impact: NonNullable<T>) => string[];
  keepLabel: string;
  confirmLabel: string;
  onDelete: () => Promise<Result<unknown>>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<NonNullable<T> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadImpact().then((result) => {
      if (!live) return;
      if (result.error !== undefined) setError(result.error);
      else setImpact(result.data as NonNullable<T>);
    });
    return () => {
      live = false;
    };
    // loadImpact is a fresh closure each render; the modal loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    const progress = loadingToast(`${confirmLabel}…`);
    const result = await onDelete();
    setDeleting(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success("Done");
    onDeleted();
  };

  return (
    <ModalFrame
      icon={faTriangleExclamation}
      tone="danger"
      title={title}
      subtitle="This cannot be undone."
      busy={deleting}
      onClose={onClose}
    >
      <div className="space-y-3 p-5">
        {impact === null && !error ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <EcgLoader />
            Checking what is attached…
          </p>
        ) : impact !== null ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            {describe(impact).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <ErrorNote error={error} />
        <ModalActions
          busy={deleting}
          onClose={onClose}
          cancelLabel={keepLabel}
          submitLabel={confirmLabel}
          danger
          disabled={impact === null}
          onSubmit={confirm}
        />
      </div>
    </ModalFrame>
  );
}
