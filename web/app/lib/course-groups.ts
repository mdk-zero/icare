import { termStatus } from "./course-progress";
import type { FacultyCourseSummary } from "./api";

/** An activity that belongs to a course (migration 070). */
export interface CourseActivity {
  id: string;
  offering_id?: string | null;
  created_at: string;
}

export interface CourseGroup<T> {
  /** The offering id, or "none" for activities made for no course. */
  key: string;
  code: string;
  title: string;
  /** The term's name, shown only when the instructor's courses span terms. */
  term: string | null;
  ended: boolean;
  /** Oldest first, so they read #1, #2, #3. */
  items: T[];
}

const oldestFirst = <T extends CourseActivity>(list: T[]) =>
  [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));

/**
 * Activities grouped by the course they were made for: the running term's
 * courses first, then upcoming and past ones, then any made for no course.
 * A running course with nothing in it stays, to show it is empty; an ended
 * one is dropped.
 */
export function groupByCourse<T extends CourseActivity>(
  items: T[],
  offerings: FacultyCourseSummary[],
): CourseGroup<T>[] {
  const order = { current: 0, upcoming: 1, ended: 2 } as const;
  const sorted = [...offerings].sort(
    (a, b) =>
      order[termStatus(a.term)] - order[termStatus(b.term)] ||
      a.course.code.localeCompare(b.course.code, undefined, { numeric: true }),
  );
  const multipleTerms = new Set(sorted.map((o) => o.term.id)).size > 1;
  const known = new Set(sorted.map((o) => o.id));
  const groups: CourseGroup<T>[] = sorted.map((o) => ({
    key: o.id,
    code: o.course.code,
    title: o.course.title,
    term: multipleTerms ? o.term.name : null,
    ended: termStatus(o.term) === "ended",
    items: oldestFirst(items.filter((a) => a.offering_id === o.id)),
  }));
  const loose = items.filter((a) => !a.offering_id || !known.has(a.offering_id));
  if (loose.length) {
    groups.push({ key: "none", code: "", title: "Not in a course", term: null, ended: false, items: loose });
  }
  return groups.filter((g) => g.items.length > 0 || (!g.ended && g.key !== "none"));
}

/**
 * Each activity's number in its course, counted in the order they were
 * made, as the course's Criteria for Assessment tab numbers them ("Quiz #3").
 * Pass every activity, not a filtered list, so a search doesn't renumber them.
 */
export function numberWithinCourse<T extends CourseActivity>(all: T[]): Map<string, number> {
  const byCourse = new Map<string, T[]>();
  for (const a of all) {
    if (!a.offering_id) continue;
    byCourse.set(a.offering_id, [...(byCourse.get(a.offering_id) ?? []), a]);
  }
  const numbers = new Map<string, number>();
  for (const list of byCourse.values()) oldestFirst(list).forEach((a, i) => numbers.set(a.id, i + 1));
  return numbers;
}
