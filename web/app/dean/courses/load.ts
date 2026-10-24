import { apiFetch, fetchDeanCourses, type DeanCourses } from "../../lib/api";
import type { InstructorOption } from "./modals";

export const NO_DATA: DeanCourses = { terms: [], courses: [], offerings: [] };
export const NO_INSTRUCTORS: InstructorOption[] = [];

/** The dean's terms, courses and assignments, and the instructors to assign. Shared by the list and Assign Course. */
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
