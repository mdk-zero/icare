"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiagramProject, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { addCurriculumCourse, createCurriculum, updateCurriculum, updateCurriculumCourse } from "../../lib/api";
import {
  CURRICULUM_LIMITS,
  TERMS,
  byYearAndTerm,
  courseUnits,
  requisitePlacement,
  roundUnits,
  termLabel,
  yearLabel,
  type CurriculumCourseRow,
} from "../../lib/curriculum";
import { loadingToast } from "../../components/Toast";
import { ErrorNote, ModalActions, ModalFrame, inputClass, labelClass } from "../courses/modals";

const YEARS = Array.from({ length: CURRICULUM_LIMITS.years }, (_, i) => i + 1);

/**
 * The courses chosen as one kind of requisite, with a list to add another.
 * Grouped by year level and term like the page, so the course being looked for
 * is where the Dean expects it.
 */
function RequisitePicker({
  id,
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
  blockedReason,
}: {
  id: string;
  label: string;
  hint: string;
  /** Every other course in the curriculum. */
  options: CurriculumCourseRow[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Why a course can't be picked here, shown beside it in the list. */
  blockedReason: (course: CurriculumCourseRow) => string | null;
}) {
  const groups = useMemo(() => byYearAndTerm(options), [options]);
  const byId = useMemo(() => new Map(options.map((c) => [c.id, c])), [options]);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((courseId) => {
            const course = byId.get(courseId);
            if (!course) return null;
            return (
              <li
                key={courseId}
                title={course.title}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600/10 py-1 pl-2.5 pr-1 font-mono text-xs font-semibold text-brand-700"
              >
                {course.code}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== courseId))}
                  disabled={disabled}
                  aria-label={`Remove ${course.code}`}
                  className="rounded p-0.5 text-brand-700/70 transition-colors hover:bg-brand-600/15 hover:text-brand-900 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <select
        id={id}
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        disabled={disabled}
        className={inputClass}
      >
        <option value="">Add a course…</option>
        {groups.flatMap(({ year, terms }) =>
          terms.map(({ term, courses }) => (
            <optgroup key={`${year}-${term}`} label={`${yearLabel(year)} · ${termLabel(term)}`}>
              {courses
                .filter((c) => !value.includes(c.id))
                .map((c) => {
                  const blocked = blockedReason(c);
                  return (
                    <option key={c.id} value={c.id} disabled={blocked !== null}>
                      {c.code} · {c.title}
                      {blocked ? ` (${blocked})` : ""}
                    </option>
                  );
                })}
            </optgroup>
          )),
        )}
      </select>
      <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

/** Adding or editing one course, with its pre-requisites and co-requisites. */
export function CourseModal({
  curriculumId,
  course,
  start,
  courses,
  onClose,
  onSaved,
}: {
  curriculumId: string;
  /** Null to add a course. */
  course: CurriculumCourseRow | null;
  /** The year level and term a new course starts in. */
  start: { year_level: number; term: number };
  courses: CurriculumCourseRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [year, setYear] = useState(course?.year_level ?? start.year_level);
  const [term, setTerm] = useState(course?.term ?? start.term);
  const [lecture, setLecture] = useState(String(course?.lecture_units ?? 0));
  const [lab, setLab] = useState(String(course?.lab_units ?? 0));
  const [note, setNote] = useState(course?.requisite_note ?? "");
  const [prerequisites, setPrerequisites] = useState(course?.prerequisite_ids ?? []);
  const [corequisites, setCorequisites] = useState(course?.corequisite_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(() => courses.filter((c) => c.id !== course?.id), [courses, course?.id]);
  const byId = useMemo(() => new Map(others.map((c) => [c.id, c])), [others]);
  const requiredBy = course ? others.filter((c) => c.prerequisite_ids.includes(course.id)) : [];
  const picked = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is CurriculumCourseRow => !!c);
  const warnings = requisitePlacement({ year_level: year, term }, picked(prerequisites), picked(corequisites));
  const units = courseUnits({ lecture_units: Number(lecture) || 0, lab_units: Number(lab) || 0 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input = {
      code,
      title,
      year_level: year,
      term,
      lecture_units: roundUnits(Number(lecture) || 0),
      lab_units: roundUnits(Number(lab) || 0),
      requisite_note: note,
      prerequisite_ids: prerequisites,
      corequisite_ids: corequisites,
    };
    const label = code.trim() || "the course";
    const progress = loadingToast(course ? `Saving ${label}…` : `Adding ${label}…`);
    const result = course
      ? await updateCurriculumCourse(curriculumId, course.id, input)
      : await addCurriculumCourse(curriculumId, input);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(course ? `${label} saved` : `${label} added`);
    onSaved();
  };

  return (
    <ModalFrame
      icon={faDiagramProject}
      title={course ? `Edit ${course.code}` : "Add a course"}
      subtitle={course ? course.title : "A course in this curriculum"}
      busy={saving}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div>
            <label htmlFor="curriculum-code" className={labelClass}>
              Code <span className="text-rose-500">*</span>
            </label>
            <input
              id="curriculum-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={CURRICULUM_LIMITS.code}
              disabled={saving}
              placeholder="NCM 101"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="curriculum-title" className={labelClass}>
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="curriculum-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={CURRICULUM_LIMITS.title}
              disabled={saving}
              placeholder="Health Assessment"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="curriculum-year" className={labelClass}>
              Year level
            </label>
            <select
              id="curriculum-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={saving}
              className={inputClass}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {yearLabel(y)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="curriculum-term" className={labelClass}>
              Term
            </label>
            <select
              id="curriculum-term"
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
              disabled={saving}
              className={inputClass}
            >
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {termLabel(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="curriculum-lecture" className={labelClass}>
              Lecture units
            </label>
            <input
              id="curriculum-lecture"
              type="number"
              inputMode="decimal"
              min={0}
              max={CURRICULUM_LIMITS.units}
              step={0.5}
              value={lecture}
              onChange={(e) => setLecture(e.target.value)}
              disabled={saving}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="curriculum-lab" className={labelClass}>
              Lab / RLE units
            </label>
            <input
              id="curriculum-lab"
              type="number"
              inputMode="decimal"
              min={0}
              max={CURRICULUM_LIMITS.units}
              step={0.5}
              value={lab}
              onChange={(e) => setLab(e.target.value)}
              disabled={saving}
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>Total units</p>
            <p className="rounded-xl border border-hairline bg-subtle px-4 py-2.5 tabular-nums text-gray-700">{units}</p>
          </div>
        </div>

        <RequisitePicker
          id="curriculum-pre"
          label="Pre-requisites"
          hint="Courses a student must pass before taking this one."
          options={others}
          value={prerequisites}
          onChange={setPrerequisites}
          disabled={saving}
          blockedReason={(c) => (corequisites.includes(c.id) ? "already a co-requisite" : null)}
        />
        <RequisitePicker
          id="curriculum-co"
          label="Co-requisites"
          hint="Courses taken in the same term. This shows on both courses."
          options={others}
          value={corequisites}
          onChange={setCorequisites}
          disabled={saving}
          blockedReason={(c) =>
            prerequisites.includes(c.id)
              ? "already a pre-requisite"
              : course && c.prerequisite_ids.includes(course.id)
                ? "needs this course first"
                : null
          }
        />

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        <div>
          <label htmlFor="curriculum-note" className={labelClass}>
            Other requirements
          </label>
          <input
            id="curriculum-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={CURRICULUM_LIMITS.note}
            disabled={saving}
            placeholder="3rd Year Standing"
            className={inputClass}
          />
        </div>

        {requiredBy.length > 0 && (
          <p className="rounded-xl border border-hairline bg-subtle px-4 py-2.5 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">Required by </span>
            {requiredBy.map((c) => c.code).join(", ")}
          </p>
        )}

        <ErrorNote error={error} />
        <ModalActions
          busy={saving}
          onClose={onClose}
          submitLabel={course ? "Save course" : "Add course"}
          disabled={!code.trim() || !title.trim()}
        />
      </form>
    </ModalFrame>
  );
}

/** Naming a blank curriculum, or renaming one. */
export function NameModal({
  curriculum,
  onClose,
  onSaved,
}: {
  /** Null to start a blank curriculum. */
  curriculum: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(curriculum?.name ?? "BS Nursing Curriculum");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = curriculum ? await updateCurriculum(curriculum.id, { name }) : await createCurriculum(name);
    setSaving(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    onSaved(curriculum?.id ?? (result.data as { curriculum: { id: string } }).curriculum.id);
  };

  return (
    <ModalFrame
      icon={faDiagramProject}
      title={curriculum ? "Rename curriculum" : "Start a blank curriculum"}
      subtitle={curriculum ? curriculum.name : "Add its courses by hand"}
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3 overflow-y-auto p-5">
        <div>
          <label htmlFor="curriculum-name" className={labelClass}>
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="curriculum-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CURRICULUM_LIMITS.name}
            disabled={saving}
            className={inputClass}
          />
        </div>
        <ErrorNote error={error} />
        <ModalActions busy={saving} onClose={onClose} submitLabel={curriculum ? "Save name" : "Create"} disabled={!name.trim()} />
      </form>
    </ModalFrame>
  );
}
