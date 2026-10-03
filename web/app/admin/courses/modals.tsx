"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  type Section,
} from "../../lib/api";
import { COURSE_LIMITS, formatTermDates, termsOverlap } from "../../lib/course-progress";
import { EcgLoader } from "../../components/EcgLoader";
import { loadingToast } from "../../components/Toast";

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export interface InstructorOption {
  id: string;
  name: string;
  groups: { id: string; name: string; section_id: string; section_name: string }[];
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-4 py-2.5 text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-semibold text-gray-700";

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

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>;
}

const normalizeCode = (code: string) => code.trim().replace(/\s+/g, " ").toLowerCase();

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
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicate =
    code.trim().length > 0 && courses.some((c) => c.id !== course?.id && normalizeCode(c.code) === normalizeCode(code));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      setError("Code and title are required.");
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
      subtitle={course ? course.title : "A course your instructors can be assigned to teach"}
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr]">
          <div>
            <label htmlFor="course-code" className={labelClass}>
              Code <span className="text-rose-500">*</span>
            </label>
            <input
              id="course-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={COURSE_LIMITS.courseCode}
              disabled={saving}
              autoFocus
              placeholder="NCM 103"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="course-title" className={labelClass}>
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="course-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={COURSE_LIMITS.courseTitle}
              disabled={saving}
              placeholder="Health Assessment"
              className={inputClass}
            />
          </div>
        </div>
        {duplicate && <p className="text-xs text-amber-600">You already have a course with this code.</p>}
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
          disabled={!code.trim() || !title.trim() || duplicate}
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
  const [name, setName] = useState(term?.name ?? "");
  const [startsOn, setStartsOn] = useState(term?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(term?.ends_on ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datesValid = startsOn !== "" && endsOn !== "" && endsOn >= startsOn;
  const overlapping = datesValid
    ? terms.filter((t) => t.id !== term?.id && termsOverlap(t, { starts_on: startsOn, ends_on: endsOn }))
    : [];
  const duplicate =
    name.trim().length > 0 &&
    terms.some((t) => t.id !== term?.id && t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !datesValid) {
      setError(!name.trim() ? "Name the term." : "The term must end on or after its start date.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = { name: name.trim(), starts_on: startsOn, ends_on: endsOn };
    const progress = loadingToast(term ? `Saving ${input.name}…` : `Adding ${input.name}…`);
    const result: Result<unknown> = term ? await updateTerm(term.id, input) : await createTerm(input);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(term ? `${input.name} saved` : `${input.name} added`);
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
        <div>
          <label htmlFor="term-name" className={labelClass}>
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="term-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={COURSE_LIMITS.termName}
            disabled={saving}
            autoFocus
            placeholder="1st Semester AY 2026–2027"
            className={inputClass}
          />
          {duplicate && <p className="mt-1.5 text-xs text-amber-600">You already have a term with this name.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="term-start" className={labelClass}>
              Starts <span className="text-rose-500">*</span>
            </label>
            <input
              id="term-start"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              disabled={saving}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="term-end" className={labelClass}>
              Ends <span className="text-rose-500">*</span>
            </label>
            <input
              id="term-end"
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(e) => setEndsOn(e.target.value)}
              disabled={saving}
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
          disabled={!name.trim() || !datesValid || duplicate}
        />
      </form>
    </ModalFrame>
  );
}

export function AssignmentModal({
  offering,
  defaultTermId,
  terms,
  courses,
  offerings,
  instructors,
  sections,
  onClose,
  onSaved,
}: {
  offering: CourseOfferingRow | null;
  defaultTermId: string;
  terms: AcademicTerm[];
  courses: CourseSummary[];
  offerings: CourseOfferingRow[];
  instructors: InstructorOption[];
  sections: Section[];
  onClose: () => void;
  onSaved: (warnings: string[]) => void;
}) {
  const [termId, setTermId] = useState(offering?.term_id ?? defaultTermId);
  const [courseId, setCourseId] = useState(offering?.course_id ?? "");
  const [facultyId, setFacultyId] = useState(offering?.faculty_id ?? "");
  const [sectionIds, setSectionIds] = useState<string[]>(offering?.sections.map((s) => s.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instructor = instructors.find((f) => f.id === facultyId) ?? null;
  const groupsBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of instructor?.groups ?? []) map.set(g.section_id, [...(map.get(g.section_id) ?? []), g.name]);
    return map;
  }, [instructor]);

  // A new assignment starts from the sections where the chosen instructor has groups.
  const pickInstructor = (id: string) => {
    setFacultyId(id);
    const picked = instructors.find((f) => f.id === id);
    if (!offering && picked && sectionIds.length === 0) {
      setSectionIds([...new Set(picked.groups.map((g) => g.section_id))]);
    }
  };

  const orderedSections = useMemo(
    () =>
      [...sections].sort(
        (a, b) =>
          Number(groupsBySection.has(b.id)) - Number(groupsBySection.has(a.id)) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
    [sections, groupsBySection],
  );

  const clash = offerings.find(
    (o) => o.id !== offering?.id && o.course_id === courseId && o.term_id === termId && o.faculty_id === facultyId,
  );
  const course = courses.find((c) => c.id === courseId);
  const term = terms.find((t) => t.id === termId);

  const toggleSection = (id: string) =>
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termId || !courseId || !facultyId || sectionIds.length === 0) {
      setError("Choose a term, a course, an instructor and at least one section.");
      return;
    }
    setSaving(true);
    setError(null);
    const label = `${course?.code ?? "Course"} for ${instructor?.name ?? "the instructor"}`;
    const progress = loadingToast(offering ? `Saving ${label}…` : `Assigning ${label}…`);
    const result = offering
      ? await updateCourseOffering(offering.id, { faculty_id: facultyId, section_ids: sectionIds })
      : await createCourseOffering({ course_id: courseId, term_id: termId, faculty_id: facultyId, section_ids: sectionIds });
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(offering ? "Assignment saved" : `Assigned ${label}`);
    onSaved(result.data.warnings ?? []);
  };

  return (
    <ModalFrame
      icon={faChalkboardUser}
      title={offering ? `Edit ${course?.code ?? "assignment"}` : "Assign a course"}
      subtitle={
        offering
          ? `${term?.name ?? "Term"} · the checklist stays with the assignment`
          : "Who teaches which course, for which sections"
      }
      busy={saving}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="assign-term" className={labelClass}>
              Term <span className="text-rose-500">*</span>
            </label>
            <select
              id="assign-term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              disabled={saving || !!offering}
              className={inputClass}
            >
              <option value="">Choose a term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-course" className={labelClass}>
              Course <span className="text-rose-500">*</span>
            </label>
            <select
              id="assign-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={saving || !!offering}
              className={inputClass}
            >
              <option value="">Choose a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="assign-instructor" className={labelClass}>
            Instructor <span className="text-rose-500">*</span>
          </label>
          <select
            id="assign-instructor"
            value={facultyId}
            onChange={(e) => pickInstructor(e.target.value)}
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
        </div>
        <fieldset>
          <legend className={labelClass}>
            Sections <span className="text-rose-500">*</span>
          </legend>
          {sections.length === 0 ? (
            <p className="text-sm text-gray-500">You have no sections yet.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-hairline p-1.5">
              {orderedSections.map((s) => {
                const groups = groupsBySection.get(s.id);
                const checked = sectionIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-subtle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSection(s.id)}
                        disabled={saving}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-800">{s.name}</span>
                        {!instructor ? null : groups ? (
                          <span className="block text-xs text-gray-500">Supervises {groups.join(", ")}</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-amber-700">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                            No group here, so no students come from this section yet
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            The checklist covers the instructor&rsquo;s own group members in these sections.
          </p>
        </fieldset>
        <ErrorNote error={error} />
        <ModalActions
          busy={saving}
          onClose={onClose}
          submitLabel={offering ? "Save assignment" : "Assign course"}
          disabled={!termId || !courseId || !facultyId || sectionIds.length === 0 || !!clash}
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
