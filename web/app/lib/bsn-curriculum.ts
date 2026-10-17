/**
 * The courses a dean picks from, and how terms are named. The courses are
 * the NCM laboratory courses ("L": skills lab and RLE) of the Batangas State
 * University BSN program curriculum, where the skills iCARE tracks are done.
 * Lecture courses, GEd and the rest of the curriculum aren't here.
 */

export interface CurriculumCourse {
  code: string;
  title: string;
  /** 1 to 4. */
  year: number;
  semester: 1 | 2;
}

export const NCM_LAB_COURSES: readonly CurriculumCourse[] = [
  { code: "NCM 101L", title: "Health Assessment (Skills Lab)", year: 1, semester: 2 },
  { code: "NCM 103L", title: "Fundamentals of Nursing Practice (Skills Lab)", year: 1, semester: 2 },
  {
    code: "NCM 104L",
    title: "Community Health Nursing (Individual and Family as Clients) (RLE and Skills Lab)",
    year: 2,
    semester: 1,
  },
  { code: "NCM 105L", title: "Nutrition and Diet Therapy (Skills Lab)", year: 2, semester: 1 },
  { code: "NCM 107L", title: "Care of Mother, Child, and Adolescent (RLE and Skills Lab)", year: 2, semester: 1 },
  {
    code: "NCM 109L",
    title: "Care of Mother, Child, at Risk or With Problems (Acute and Chronic) - Skills Lab and RLE",
    year: 2,
    semester: 2,
  },
  { code: "NCM 110L", title: "Nursing Informatics (Lab)", year: 2, semester: 2 },
  {
    code: "NCM 112L",
    title:
      "Care of Clients With Problems in Oxygenation, Fluid and Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations, Acute and Chronic (Skills Lab and RLE)",
    year: 3,
    semester: 1,
  },
  {
    code: "NCM 113L",
    title: "Community Health Nursing 2 (Population Groups and Community as Clients) - RLE",
    year: 3,
    semester: 1,
  },
  { code: "NCM 114L", title: "Care of Older Person", year: 3, semester: 1 },
  { code: "NCM 115L", title: "Nursing Research 2 (RLE)", year: 3, semester: 2 },
  {
    code: "NCM 116L",
    title:
      "Care of Clients With Problems in Nutrition and Gastrointestinal Metabolism and Endocrine, Perception and Coordination, Acute and Chronic (Skills Lab and RLE)",
    year: 3,
    semester: 2,
  },
  {
    code: "NCM 117L",
    title: "Care of Clients With Maladaptive Patterns of Behavior, Acute and Chronic (RLE)",
    year: 3,
    semester: 2,
  },
  {
    code: "NCM 118L",
    title:
      "Nursing Care of Clients With Life-threatening Conditions, Acutely-Ill, Multi-Organ Problems, High Acuity and Emergency Situations, Acute and Chronic (RLE and Skills Lab)",
    year: 4,
    semester: 1,
  },
  { code: "NCM 119L", title: "Nursing Leadership and Management (RLE)", year: 4, semester: 1 },
  { code: "NCM 121L", title: "Disaster Nursing (Skills Lab)", year: 4, semester: 2 },
];

const ORDINAL = ["First", "Second", "Third", "Fourth"];

/** "First Year · Second Semester", for grouping the course list. */
export const curriculumGroup = (c: Pick<CurriculumCourse, "year" | "semester">) =>
  `${ORDINAL[c.year - 1]} Year · ${ORDINAL[c.semester - 1]} Semester`;

/** The curriculum's courses, grouped in curriculum order. */
export function curriculumGroups(): { label: string; courses: CurriculumCourse[] }[] {
  const out = new Map<string, CurriculumCourse[]>();
  for (const c of NCM_LAB_COURSES) out.set(curriculumGroup(c), [...(out.get(curriculumGroup(c)) ?? []), c]);
  return [...out].map(([label, courses]) => ({ label, courses }));
}

export const sameCode = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export type Semester = "first" | "second" | "midterm";

export const SEMESTERS: { key: Semester; label: string }[] = [
  { key: "first", label: "First Semester" },
  { key: "second", label: "Second Semester" },
  { key: "midterm", label: "Midterm" },
];

/** "1st Semester AY 2026–2027": how terms have always been named. */
export function termName(semester: Semester, startYear: number): string {
  const prefix = semester === "first" ? "1st Semester" : semester === "second" ? "2nd Semester" : "Midterm";
  return `${prefix} AY ${startYear}–${startYear + 1}`;
}

/** Reads a term's semester and academic year back from its name; null when it doesn't follow the pattern. */
export function parseTermName(name: string): { semester: Semester; startYear: number } | null {
  const year = /(\d{4})\s*[–—-]\s*(\d{4})/.exec(name);
  if (!year) return null;
  const n = name.toLowerCase();
  const semester: Semester | null = /\b(1st|first)\b/.test(n)
    ? "first"
    : /\b(2nd|second)\b/.test(n)
      ? "second"
      : /mid/.test(n)
        ? "midterm"
        : null;
  return semester ? { semester, startYear: Number(year[1]) } : null;
}

/** The academic year running now: it starts in June. */
export function currentAcademicYear(now = new Date()): number {
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Academic years to choose from: last year to two ahead, plus any a term already uses. */
export function academicYearOptions(used: number[] = [], now = new Date()): number[] {
  const base = currentAcademicYear(now);
  return [...new Set([base - 1, base, base + 1, base + 2, ...used])].sort((a, b) => a - b);
}

/** Usual dates for a new term, to start from. */
export function defaultTermDates(semester: Semester, startYear: number): { starts_on: string; ends_on: string } {
  const next = startYear + 1;
  if (semester === "first") return { starts_on: `${startYear}-08-01`, ends_on: `${startYear}-12-20` };
  if (semester === "second") return { starts_on: `${next}-01-15`, ends_on: `${next}-05-31` };
  return { starts_on: `${next}-06-15`, ends_on: `${next}-07-31` };
}
