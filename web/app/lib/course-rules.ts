import { NCM_LAB_COURSES, parseTermName, sameCode, type CurriculumCourse, type Semester } from "./bsn-curriculum";

/**
 * What keeps a Dean's courses in step with their curriculum: a course is one
 * of the curriculum's laboratory courses, it runs only in the semester the
 * curriculum puts it in, its sections are of the curriculum's year level, and
 * a Dean has one term per semester of an academic year.
 *
 * The routes check these on what a request adds (a new course, a new term, a
 * newly added section), never on what is already there, so an assignment made
 * before the rules can still be fixed or removed. Where a term's name doesn't
 * say its semester, or a section's name doesn't say its year ("App Review",
 * "Test-Section"), there is nothing to compare, and it passes.
 *
 * Pure, so the routes, the demo and the screens share it.
 */

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

/** The curriculum's term number for a term's semester: 1, 2, or 3 for midyear. */
const SEMESTER_NUMBER: Record<Semester, number> = { first: 1, second: 2, midterm: 3 };

export const yearLabel = (year: number) => `${ORDINAL[year - 1] ?? `Year ${year}`} Year`;
export const semesterLabel = (semester: number) =>
  semester === 3 ? "Midyear" : `${ORDINAL[semester - 1] ?? `Term ${semester}`} Semester`;

/** The curriculum term a semester picker value stands for. */
export const semesterNumber = (semester: Semester) => SEMESTER_NUMBER[semester];

/** 1, 2 or 3 from a term's name ("1st Semester AY 2026–2027" is 1), or null when the name doesn't say. */
export function termSemester(name: string): number | null {
  const parsed = parseTermName(name);
  return parsed ? SEMESTER_NUMBER[parsed.semester] : null;
}

/**
 * A section's year level from its name: the first digit of its number, as the
 * school names them (BSN 2101 is a second-year section). Null when the name has
 * no such number.
 */
export function sectionYear(name: string): number | null {
  const match = /(?:^|\D)([1-6])\d{3}(?!\d)/.exec(name);
  return match ? Number(match[1]) : null;
}

/** The catalog a Dean picks from: their curriculum's lab courses, or the built-in list without one. */
export const catalogOrDefault = (catalog: readonly CurriculumCourse[] | null | undefined): readonly CurriculumCourse[] =>
  catalog?.length ? catalog : NCM_LAB_COURSES;

export const catalogCourse = (catalog: readonly CurriculumCourse[], code: string) =>
  catalog.find((c) => sameCode(c.code, code)) ?? null;

/** Why a course can't be added under this code, or null when it can. */
export function courseCodeProblem(catalog: readonly CurriculumCourse[], code: string): string | null {
  return catalogCourse(catalog, code)
    ? null
    : `${code} isn't one of the laboratory courses in your curriculum. Choose a course from the list.`;
}

/** Whether a course runs in this semester; true when the term's name doesn't say. */
export function fitsTerm(course: Pick<CurriculumCourse, "semester">, termName: string): boolean {
  const semester = termSemester(termName);
  return semester === null || semester === course.semester;
}

/** Whether a section can take this course; true when the section's name doesn't say its year. */
export function fitsSection(course: Pick<CurriculumCourse, "year">, sectionName: string): boolean {
  const year = sectionYear(sectionName);
  return year === null || year === course.year;
}

export function termProblem(course: CurriculumCourse, termName: string): string | null {
  if (fitsTerm(course, termName)) return null;
  return `${course.code} is a ${semesterLabel(course.semester)} course in your curriculum (${yearLabel(course.year)}), so it can't be given in ${termName}.`;
}

export function sectionProblem(course: CurriculumCourse, sectionName: string): string | null {
  if (fitsSection(course, sectionName)) return null;
  const year = sectionYear(sectionName) as number;
  return `${sectionName} is a ${yearLabel(year)} section, but ${course.code} is a ${yearLabel(course.year)} course in your curriculum.`;
}

/**
 * Why this course can't be given in this term, or to these sections; null when
 * it can. A course outside the curriculum can't be given at all.
 */
export function offeringProblem(input: {
  catalog: readonly CurriculumCourse[];
  code: string;
  termName: string;
  sectionNames?: string[];
}): string | null {
  const course = catalogCourse(input.catalog, input.code);
  if (!course) return `${input.code} isn't one of the laboratory courses in your curriculum, so it can't be assigned.`;
  const term = termProblem(course, input.termName);
  if (term) return term;
  for (const name of input.sectionNames ?? []) {
    const problem = sectionProblem(course, name);
    if (problem) return problem;
  }
  return null;
}

/**
 * Sections newly added to an existing assignment: only their year is checked,
 * and only when the course is one the curriculum knows. A course from before
 * the rules keeps working, so it can be wound down.
 */
export function addedSectionsProblem(
  catalog: readonly CurriculumCourse[],
  code: string,
  addedSectionNames: string[],
): string | null {
  const course = catalogCourse(catalog, code);
  if (!course) return null;
  for (const name of addedSectionNames) {
    const problem = sectionProblem(course, name);
    if (problem) return problem;
  }
  return null;
}

/** A new term's name must say its semester and academic year, as the semester picker writes it. */
export function termNameProblem(name: string): string | null {
  return parseTermName(name) ? null : 'Name the semester with its academic year, like "1st Semester AY 2026–2027".';
}

/** The Dean's other term for the same semester of the same academic year, if there is one. */
export function sameSemesterTerm<T extends { id: string; name: string }>(terms: T[], name: string, exceptId?: string): T | null {
  const wanted = parseTermName(name);
  if (!wanted) return null;
  return (
    terms.find((t) => {
      if (t.id === exceptId) return false;
      const other = parseTermName(t.name);
      return !!other && other.semester === wanted.semester && other.startYear === wanted.startYear;
    }) ?? null
  );
}
