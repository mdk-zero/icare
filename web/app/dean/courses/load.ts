import { apiFetch, fetchDeanCourses, type DeanCourses, type Section } from "../../lib/api";
import { NCM_LAB_COURSES } from "../../lib/bsn-curriculum";
import type { CourseChoice } from "../../instructor/analytics/CourseFilter";
import type { InstructorOption } from "./modals";

export const NO_DATA: DeanCourses = { terms: [], courses: [], offerings: [] };
export const NO_INSTRUCTORS: InstructorOption[] = [];

export type DeanCourseChoice = CourseChoice & { sections: Section[] };

/**
 * The assignments the Analytics course filter offers a Dean, the same ones
 * Performance per Course counts: every assignment of their courses that has an
 * instructor, by course code.
 */
export function deanCourseChoices({ courses, terms, offerings }: DeanCourses = NO_DATA): DeanCourseChoice[] {
  return offerings
    .flatMap((o) => {
      const course = courses.find((c) => c.id === o.course_id);
      const term = terms.find((t) => t.id === o.term_id);
      if (!o.faculty_id || !course || !term) return [];
      return [
        {
          id: o.id,
          course: { code: course.code, title: course.title },
          term: { id: term.id, name: term.name, starts_on: term.starts_on, ends_on: term.ends_on },
          sections: o.sections,
          student_count: o.student_count,
          instructor: o.faculty_name,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.course.code.localeCompare(b.course.code, undefined, { numeric: true }) ||
        (a.instructor ?? "").localeCompare(b.instructor ?? ""),
    );
}

/** What the course pickers offer: the Dean's curriculum in use, or the built-in list. */
export const pickerCatalog = (courses?: DeanCourses) =>
  courses?.catalog?.length ? courses.catalog : NCM_LAB_COURSES;

/** The dean's terms, courses and assignments, and the instructors to assign. Shared by the list and Add Course. */
export async function loadDeanCourses() {
  const [courses, facultyRes] = await Promise.all([
    fetchDeanCourses(),
    apiFetch("/api/admin/faculty", { credentials: "include" }),
  ]);
  const instructors = facultyRes.ok
    ? ((await facultyRes.json()) as { faculty?: InstructorOption[] }).faculty ?? NO_INSTRUCTORS
    : NO_INSTRUCTORS;
  return {
    courses: courses.data ?? NO_DATA,
    error: courses.error ?? null,
    instructors,
  };
}
