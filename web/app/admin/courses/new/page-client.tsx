"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBookMedical,
  faCalendarDays,
  faChalkboardUser,
  faUserTie,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../components/PageHeader";
import SheetStep from "../../../components/SheetStep";
import { EcgLoader } from "../../../components/EcgLoader";
import { loadingToast } from "../../../components/Toast";
import { usePageData } from "../../../lib/use-page-data";
import { forgetPage } from "../../../lib/request-cache";
import { createCourse, createCourseOffering, createTerm } from "../../../lib/api";
import { COURSE_LIMITS, formatTermDates } from "../../../lib/course-progress";
import {
  NCM_LAB_COURSES,
  academicYearOptions,
  curriculumGroup,
  defaultTermDates,
  parseTermName,
  sameCode,
  termName,
  type Semester,
} from "../../../lib/bsn-curriculum";
import {
  CoursePicker,
  ErrorNote,
  TermDates,
  TermPicker,
  findTerm,
  inputClass,
  labelClass,
  startingTerm,
} from "../modals";
import { NO_DATA, NO_INSTRUCTORS, loadDeanCourses } from "../load";

/**
 * Assign Course, as one top-to-bottom sheet: the term, the course and who
 * teaches it. A term or course that doesn't exist yet is added on Assign, so
 * nothing has to be set up first. The instructor adds the sections later.
 */
export default function AssignCourseClient() {
  const router = useRouter();
  // "Assign for this term" on the list opens here with the course and term picked.
  const params = useSearchParams();
  const { data, loading } = usePageData("admin:courses", loadDeanCourses);
  const { terms, courses, offerings } = data?.courses ?? NO_DATA;
  const instructors = data?.instructors ?? NO_INSTRUCTORS;

  // Starts on the current term once the data is in; until then, by today's date.
  const [picked, setPicked] = useState<{ semester: Semester; year: number } | null>(null);
  const start = picked ?? startingTerm(terms, params.get("term"));
  const { semester, year } = start;
  const [dates, setDates] = useState<{ starts_on: string; ends_on: string } | null>(null);
  const termDates = dates ?? defaultTermDates(semester, year);
  const [code, setCode] = useState(params.get("course") ?? "");
  const [description, setDescription] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = academicYearOptions(terms.map((t) => parseTermName(t.name)?.startYear ?? 0).filter(Boolean));
  const name = termName(semester, year);
  const term = findTerm(terms, semester, year);
  const course = courses.find((c) => sameCode(c.code, code)) ?? null;
  const fromCurriculum = NCM_LAB_COURSES.find((c) => sameCode(c.code, code)) ?? null;
  const instructor = instructors.find((f) => f.id === facultyId) ?? null;
  const datesValid = termDates.starts_on !== "" && termDates.ends_on !== "" && termDates.ends_on >= termDates.starts_on;
  const clash =
    term && course
      ? offerings.find((o) => o.course_id === course.id && o.term_id === term.id && o.faculty_id === facultyId)
      : undefined;
  const termDone = Boolean(term) || datesValid;
  const ready = termDone && Boolean(code) && Boolean(facultyId) && !clash;

  const pickTerm = (next: { semester: Semester; year: number }) => {
    setPicked(next);
    setDates(null);
    // The course list follows the semester: a course from the other one is cleared.
    const inCurriculum = NCM_LAB_COURSES.find((c) => sameCode(c.code, code));
    const semesterNo = next.semester === "first" ? 1 : next.semester === "second" ? 2 : null;
    if (inCurriculum && semesterNo !== null && inCurriculum.semester !== semesterNo) setCode("");
  };

  const assign = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    const label = `${code} for ${instructor?.name ?? "the instructor"}`;
    const progress = loadingToast(`Assigning ${label}…`);
    const fail = (message: string) => {
      setSaving(false);
      progress.error(message);
      setError(message);
    };
    let termId = term?.id ?? null;
    if (!termId) {
      const made = await createTerm({ name, ...termDates });
      if (made.error !== undefined) return fail(made.error);
      termId = made.data.term.id;
    }
    let courseId = course?.id ?? null;
    if (!courseId) {
      const made = await createCourse({
        code,
        title: fromCurriculum?.title ?? code,
        description: description.trim(),
      });
      if (made.error !== undefined) return fail(made.error);
      courseId = made.data.course.id;
    }
    const result = await createCourseOffering({ course_id: courseId, term_id: termId, faculty_id: facultyId, section_ids: [] });
    if (result.error !== undefined) return fail(result.error);
    progress.success(`Assigned ${label}`);
    // The list reloads with the new assignment on it.
    forgetPage("admin:courses");
    router.push("/admin/courses");
  };

  return (
    <div className="pb-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faChalkboardUser} className="h-3.5 w-3.5" />, label: "Curriculum" }}
        title="Assign Course"
        subtitle="Pick the term, the course and the instructor who teaches it"
      />
      <button
        onClick={() => router.push("/admin/courses")}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-brand-700"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
        Back to courses
      </button>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-tile sm:p-6">
          {loading && !data ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <EcgLoader className="text-brand-600" /> Loading your terms and courses…
            </p>
          ) : (
            <>
              {/* 01 — Term */}
              <SheetStep
                n={1}
                title="Term"
                done={termDone}
                tag={<span className="text-xs font-medium text-red-600">Required</span>}
                hint="Only work graded within the term's dates counts toward the course."
              >
                <TermPicker semester={semester} year={year} years={years} onChange={pickTerm} disabled={saving} idPrefix="assign" />
                {term ? (
                  <p className="mt-3 text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{term.name}</span> · {formatTermDates(term)}
                  </p>
                ) : (
                  <div className="mt-3 space-y-3 rounded-xl border border-dashed border-brand-600/30 bg-brand-600/5 p-3">
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{name}</span>{" "}is new: it&apos;s added when you
                      assign. Check its dates.
                    </p>
                    <TermDates
                      startsOn={termDates.starts_on}
                      endsOn={termDates.ends_on}
                      onChange={setDates}
                      terms={terms}
                      disabled={saving}
                      idPrefix="assign"
                    />
                  </div>
                )}
              </SheetStep>

              {/* 02 — Course */}
              <SheetStep
                n={2}
                title="Course"
                done={Boolean(code)}
                tag={<span className="text-xs font-medium text-red-600">Required</span>}
                hint={
                  semester === "midterm"
                    ? "The NCM laboratory courses of the BSN curriculum."
                    : `The NCM laboratory courses taught in the ${semester === "first" ? "first" : "second"} semester.`
                }
              >
                <label htmlFor="assign-course" className="sr-only">
                  Course
                </label>
                <CoursePicker
                  id="assign-course"
                  value={code}
                  onChange={setCode}
                  disabled={saving}
                  existing={courses}
                  semester={semester}
                />
                {code && !course && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500">Not in your courses yet: it&apos;s added when you assign.</p>
                    <label htmlFor="assign-description" className={labelClass}>
                      Description <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      id="assign-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={COURSE_LIMITS.courseDescription}
                      disabled={saving}
                      rows={3}
                      placeholder="What the course covers. Detect with AI reads this to find the course's skills."
                      className={`${inputClass} resize-y`}
                    />
                  </div>
                )}
              </SheetStep>

              {/* 03 — Instructor */}
              <SheetStep
                n={3}
                title="Instructor"
                done={Boolean(facultyId)}
                last
                tag={<span className="text-xs font-medium text-red-600">Required</span>}
                hint="They add the sections they teach it in. Students come from their groups in each section."
              >
                <label htmlFor="assign-instructor" className="sr-only">
                  Instructor
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
                    {instructor?.name ?? "This instructor"} already teaches this course in this term.
                  </p>
                )}
              </SheetStep>
            </>
          )}
        </div>

        {/* The assignment at a glance, with Assign: beside the sheet on wide screens. */}
        <aside className="space-y-3 xl:sticky xl:top-0">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
            <div className="relative bg-brand-600 px-4 pb-4 pt-3.5 text-white">
              <span
                aria-hidden
                className="absolute inset-0 opacity-[0.12] bg-[repeating-linear-gradient(90deg,#fff_0,#fff_1px,transparent_1px,transparent_14px),repeating-linear-gradient(0deg,#fff_0,#fff_1px,transparent_1px,transparent_14px)]"
              />
              <p className="relative text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">Course assignment</p>
              <p className={`relative mt-1 font-display text-lg font-semibold leading-snug ${code ? "text-white" : "text-white/55"}`}>
                {code || "No course yet"}
              </p>
              {fromCurriculum && <p className="relative mt-0.5 text-xs text-white/80">{fromCurriculum.title}</p>}
            </div>
            <dl className="divide-y divide-hairline text-sm">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <FontAwesomeIcon icon={faCalendarDays} className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">Term</dt>
                <dd className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900">{name}</span>
                  {!term && <span className="ml-1.5 text-xs text-brand-700">new</span>}
                </dd>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">Year level</dt>
                <dd className="min-w-0 flex-1 truncate text-gray-700">
                  {fromCurriculum ? curriculumGroup(fromCurriculum) : <span className="text-gray-400">—</span>}
                </dd>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <FontAwesomeIcon icon={faUserTie} className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">Instructor</dt>
                <dd className="min-w-0 flex-1 truncate">
                  {instructor ? (
                    <span className="font-medium text-gray-900">{instructor.name}</span>
                  ) : (
                    <span className="text-gray-400">No instructor yet</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="space-y-2 border-t border-hairline p-4">
              <ErrorNote error={error} />
              <button
                type="button"
                onClick={() => void assign()}
                disabled={!ready || saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
              >
                {saving && <EcgLoader />}
                Assign course
              </button>
              <button
                type="button"
                onClick={() => router.push("/admin/courses")}
                disabled={saving}
                className="w-full rounded-lg border border-gray-200 bg-surface px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
