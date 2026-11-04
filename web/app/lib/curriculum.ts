import { isLabCourse } from './bsn-curriculum';
import type { Parsed } from './course-progress';

/**
 * A curriculum's rules, with nothing server-only in them, so the API routes,
 * the page and the demo all read and check one the same way: what a course may
 * hold, how an AI reading of a PDF becomes courses, and what to flag for a
 * person to look at.
 */

/** These match the checks in migration 091; change the two together. */
export const CURRICULUM_LIMITS = {
  name: 150,
  code: 50,
  title: 1000,
  note: 300,
  units: 99,
  years: 6,
  /** Largest PDF, matching the bucket's file_size_limit. */
  fileBytes: 20 * 1024 * 1024,
  /** A curriculum is a few pages. Past this it is more likely a whole handbook. */
  pages: 40,
};

export const MIDYEAR = 3;
export const TERMS = [1, 2, MIDYEAR] as const;

export interface CurriculumCourseRow {
  id: string;
  code: string;
  title: string;
  year_level: number;
  term: number;
  lecture_units: number;
  lab_units: number;
  requisite_note: string;
  position: number;
  prerequisite_ids: string[];
  corequisite_ids: string[];
}

/** A term's total as the PDF printed it. */
export interface StatedUnits {
  year_level: number;
  term: number;
  units: number;
}

export interface CurriculumAnalysis {
  stated_units: StatedUnits[];
  /** What the reading couldn't be sure of, for a person to check. */
  notes: string[];
}

export const EMPTY_ANALYSIS: CurriculumAnalysis = { stated_units: [], notes: [] };

const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];

export const yearLabel = (year: number) => `${ORDINAL[year - 1] ?? `Year ${year}`} Year`;
export const termLabel = (term: number) => (term === MIDYEAR ? 'Midyear' : `${ORDINAL[term - 1] ?? ''} Semester`);
export const termPlace = (c: { year_level: number; term: number }) => `${yearLabel(c.year_level)}, ${termLabel(c.term)}`;

export const courseUnits = (c: Pick<CurriculumCourseRow, 'lecture_units' | 'lab_units'>) =>
  roundUnits(c.lecture_units + c.lab_units);

/** Half units add up without a float's trailing digits. */
export const roundUnits = (n: number) => Math.round(n * 10) / 10;

export const sumUnits = (courses: Pick<CurriculumCourseRow, 'lecture_units' | 'lab_units'>[]) =>
  roundUnits(courses.reduce((total, c) => total + c.lecture_units + c.lab_units, 0));

/** Curriculum order: year level, then term, then as listed. */
export function inCurriculumOrder<T extends Pick<CurriculumCourseRow, 'year_level' | 'term' | 'position'>>(courses: T[]): T[] {
  return [...courses].sort((a, b) => a.year_level - b.year_level || a.term - b.term || a.position - b.position);
}

// ---------------------------------------------------------------------------
// A course as typed
// ---------------------------------------------------------------------------

export interface CurriculumCourseInput {
  code: string;
  title: string;
  year_level: number;
  term: number;
  lecture_units: number;
  lab_units: number;
  requisite_note: string;
  prerequisite_ids: string[];
  corequisite_ids: string[];
}

const collapse = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

function idList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return null;
  return [...new Set(value as string[])];
}

function unitsOf(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() === '' ? 0 : Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > CURRICULUM_LIMITS.units) return null;
  return roundUnits(n);
}

export function parseCurriculumName(value: unknown): Parsed<string> {
  const name = collapse(value);
  if (!name) return { ok: false, error: 'Give the curriculum a name' };
  if (name.length > CURRICULUM_LIMITS.name) {
    return { ok: false, error: `The name is too long (max ${CURRICULUM_LIMITS.name} characters)` };
  }
  return { ok: true, value: name };
}

export function parseCurriculumCourse(body: Record<string, unknown>): Parsed<CurriculumCourseInput> {
  const code = collapse(body.code);
  const title = collapse(body.title);
  const note = collapse(body.requisite_note);
  if (!code) return { ok: false, error: 'Enter the course code' };
  if (code.length > CURRICULUM_LIMITS.code) {
    return { ok: false, error: `Course code is too long (max ${CURRICULUM_LIMITS.code} characters)` };
  }
  if (!title) return { ok: false, error: 'Enter the course title' };
  if (title.length > CURRICULUM_LIMITS.title) {
    return { ok: false, error: `Course title is too long (max ${CURRICULUM_LIMITS.title} characters)` };
  }
  if (note.length > CURRICULUM_LIMITS.note) {
    return { ok: false, error: `Other requirements are too long (max ${CURRICULUM_LIMITS.note} characters)` };
  }
  const year = Number(body.year_level);
  if (!Number.isInteger(year) || year < 1 || year > CURRICULUM_LIMITS.years) return { ok: false, error: 'Choose a year level' };
  const term = Number(body.term);
  if (!(TERMS as readonly number[]).includes(term)) return { ok: false, error: 'Choose a term' };
  const lecture = unitsOf(body.lecture_units);
  const lab = unitsOf(body.lab_units);
  if (lecture === null || lab === null) {
    return { ok: false, error: `Units must be between 0 and ${CURRICULUM_LIMITS.units}` };
  }
  const pre = idList(body.prerequisite_ids);
  const co = idList(body.corequisite_ids);
  if (!pre || !co) return { ok: false, error: 'Invalid pre-requisites or co-requisites' };
  if (pre.some((id) => co.includes(id))) {
    return { ok: false, error: 'A course cannot be both a pre-requisite and a co-requisite' };
  }
  return {
    ok: true,
    value: {
      code,
      title,
      year_level: year,
      term,
      lecture_units: lecture,
      lab_units: lab,
      requisite_note: note,
      prerequisite_ids: pre,
      corequisite_ids: co,
    },
  };
}

/**
 * Why a course's chosen requisites can't be stored, or null. Each must be
 * another course in this curriculum, and a pair can only be one kind: a course
 * can't take as a co-requisite one that already needs it passed first.
 */
export function requisiteProblem(
  courses: CurriculumCourseRow[],
  courseId: string | null,
  prerequisiteIds: string[],
  corequisiteIds: string[],
): string | null {
  const byId = new Map(courses.map((c) => [c.id, c]));
  for (const id of [...prerequisiteIds, ...corequisiteIds]) {
    if (id === courseId) return 'A course cannot require itself';
    if (!byId.has(id)) return 'A chosen requisite is not in this curriculum';
  }
  if (courseId) {
    for (const id of corequisiteIds) {
      const other = byId.get(id);
      if (other?.prerequisite_ids.includes(courseId)) {
        return `${other.code} lists this course as a pre-requisite, so it can't also be a co-requisite`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// A reading of a PDF
// ---------------------------------------------------------------------------

export interface ImportedCourse {
  code: string;
  title: string;
  year_level: number;
  term: number;
  lecture_units: number;
  lab_units: number;
  requisite_note: string;
  position: number;
  /** Codes of other courses in this reading. */
  prerequisites: string[];
  corequisites: string[];
}

export interface ImportedCurriculum {
  name: string;
  courses: ImportedCourse[];
  analysis: CurriculumAnalysis;
}

/** "NCM-101", "ncm 101" and "NCM101" are one course when matching requisites. */
const matchKey = (code: string) => code.toLowerCase().replace(/[\s.\-_]+/g, '');

const NO_REQUISITE = /^(none|n\/?a|nil|no|not applicable|-+|–|—|\.+)$/i;
const CODE_LIKE = /^[A-Za-z]{2,10}[ .-]?\d{1,4}[A-Za-z]?$/;
const NOT_A_CODE = /^(year|yr|grade|level|semester|sem|term|units?)\b/i;
/** A course code written inside a sentence, such as a note's "Pre-req: NCM 999". */
const CODE_IN_TEXT = /\b[A-Z]{2,10}[ -]?\d{1,4}[A-Z]?\b/g;

const looksLikeCode = (text: string) => CODE_LIKE.test(text) && !NOT_A_CODE.test(text);

/** Units as printed: a number, or one in parentheses such as NSTP's "(3)". */
function printedUnits(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.replace(/[()\s]/g, '')) : Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= CURRICULUM_LIMITS.units ? roundUnits(n) : 0;
}

function textList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return list.map(collapse).filter((item) => item && !NO_REQUISITE.test(item));
}

/**
 * One printed requisite as codes, when it is only codes ("NCM 101, NCM 102").
 * Anything else stays whole, so "All 1st and 2nd year courses" isn't cut in two,
 * and neither is an either-or, which a plain list of pre-requisites can't say.
 */
function requisiteCodes(item: string, known: Map<string, string>): string[] | null {
  if (/\bor\b/i.test(item)) return null;
  const parts = item.split(/[,;/&\n]|\band\b/i).map(collapse).filter(Boolean);
  const isCode = (part: string) => known.has(matchKey(part)) || looksLikeCode(part);
  return parts.length > 0 && parts.every(isCode) ? parts : null;
}

/**
 * Turns the model's answer into courses, trusting none of it: junk rows are
 * dropped, numbers clamped, and every requisite either resolves to a course in
 * the reading or stays visible as a note, which curriculumIssues() then flags.
 * Nothing the PDF said is lost, and a course repeated under one code (a shared
 * "Elective", say) keeps both rows.
 */
export function readImportedCurriculum(raw: Record<string, unknown>, fallbackName: string): ImportedCurriculum {
  const notes: string[] = textList(raw.notes).slice(0, 12);
  const stated: StatedUnits[] = [];
  const parsed: (ImportedCourse & { rawPre: string[]; rawCo: string[] })[] = [];
  const used = new Map<string, number>();

  for (const entry of Array.isArray(raw.terms) ? raw.terms : []) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as Record<string, unknown>;
    const year = Number(t.year);
    if (!Number.isInteger(year) || year < 1 || year > CURRICULUM_LIMITS.years) continue;
    const term = Number(t.term);
    if (!(TERMS as readonly number[]).includes(term)) continue;

    if (t.stated_units !== null && t.stated_units !== undefined) {
      const units = printedUnits(t.stated_units);
      if (units > 0) stated.push({ year_level: year, term, units });
    }

    for (const row of Array.isArray(t.courses) ? t.courses : []) {
      if (!Array.isArray(row)) continue;
      const [rawCode, rawTitle, lecture, lab, pre, co] = row as unknown[];
      const title = collapse(rawTitle).slice(0, CURRICULUM_LIMITS.title);
      let code = collapse(rawCode).slice(0, CURRICULUM_LIMITS.code - 4);
      if (!code) code = title.slice(0, CURRICULUM_LIMITS.code - 4).trim();
      if (!code) continue;

      const key = code.toLowerCase();
      const seen = (used.get(key) ?? 0) + 1;
      used.set(key, seen);
      if (seen > 1) {
        notes.push(`${code} is listed ${seen} times, so this one was saved as "${code} (${seen})". Check its code.`);
        code = `${code} (${seen})`;
      }

      parsed.push({
        code,
        title: title || code,
        year_level: year,
        term,
        lecture_units: printedUnits(lecture),
        lab_units: printedUnits(lab),
        requisite_note: '',
        position: parsed.length,
        prerequisites: [],
        corequisites: [],
        rawPre: textList(pre),
        rawCo: textList(co),
      });
    }
  }

  const known = new Map(parsed.map((c) => [matchKey(c.code), c.code]));
  for (const course of parsed) {
    const noted: string[] = [];
    const resolve = (items: string[], label: string, into: string[]) => {
      for (const item of items) {
        const codes = requisiteCodes(item, known);
        if (!codes) {
          noted.push(item);
          continue;
        }
        for (const code of codes) {
          const match = known.get(matchKey(code));
          if (!match) noted.push(`${label}: ${code}`);
          else if (match !== course.code && !into.includes(match)) into.push(match);
        }
      }
    };
    resolve(course.rawPre, 'Pre-req', course.prerequisites);
    resolve(course.rawCo, 'Co-req', course.corequisites);
    // A pair can only be one of the two; the stricter reading wins.
    course.corequisites = course.corequisites.filter((code) => !course.prerequisites.includes(code));
    course.requisite_note = [...new Set(noted)].join('; ').slice(0, CURRICULUM_LIMITS.note);
  }

  const courses: ImportedCourse[] = parsed.map((c) => ({
    code: c.code,
    title: c.title,
    year_level: c.year_level,
    term: c.term,
    lecture_units: c.lecture_units,
    lab_units: c.lab_units,
    requisite_note: c.requisite_note,
    position: c.position,
    prerequisites: c.prerequisites,
    corequisites: c.corequisites,
  }));

  return {
    name: collapse(raw.name).slice(0, CURRICULUM_LIMITS.name) || collapse(fallbackName).slice(0, CURRICULUM_LIMITS.name) || 'Curriculum',
    courses,
    analysis: { stated_units: stated, notes },
  };
}

/** The stored form of a co-requisite goes both ways; a pre-requisite on the same pair wins. */
export function requisiteRows(
  courses: { id: string; prerequisite_ids: string[]; corequisite_ids: string[] }[],
): { course_id: string; requires_id: string; kind: 'pre' | 'co' }[] {
  const rows = new Map<string, { course_id: string; requires_id: string; kind: 'pre' | 'co' }>();
  for (const c of courses) {
    for (const id of c.prerequisite_ids) {
      if (id !== c.id) rows.set(`${c.id}:${id}`, { course_id: c.id, requires_id: id, kind: 'pre' });
    }
  }
  for (const c of courses) {
    for (const id of c.corequisite_ids) {
      if (id === c.id) continue;
      if (!rows.has(`${c.id}:${id}`)) rows.set(`${c.id}:${id}`, { course_id: c.id, requires_id: id, kind: 'co' });
      if (!rows.has(`${id}:${c.id}`)) rows.set(`${id}:${c.id}`, { course_id: id, requires_id: c.id, kind: 'co' });
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// What to check
// ---------------------------------------------------------------------------

export interface CurriculumIssue {
  /** Stable, for React and for testing. */
  key: string;
  /** The course to open to fix it, when there is one. */
  course_id: string | null;
  message: string;
}

const termRank = (c: { year_level: number; term: number }) => c.year_level * 10 + c.term;

/** Each loop of pre-requisites once, as the codes around it. */
function prerequisiteLoops(courses: CurriculumCourseRow[]): CurriculumCourseRow[][] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const state = new Map<string, 'visiting' | 'done'>();
  const loops: CurriculumCourseRow[][] = [];
  const path: CurriculumCourseRow[] = [];

  const visit = (course: CurriculumCourseRow) => {
    state.set(course.id, 'visiting');
    path.push(course);
    for (const id of course.prerequisite_ids) {
      const next = byId.get(id);
      if (!next) continue;
      if (state.get(id) === 'visiting') loops.push(path.slice(path.findIndex((c) => c.id === id)));
      else if (!state.has(id)) visit(next);
    }
    path.pop();
    state.set(course.id, 'done');
  };
  for (const course of courses) if (!state.has(course.id)) visit(course);
  return loops;
}

/**
 * The problems a person should look at, worked out from the courses as they
 * stand, so each one clears as soon as it is fixed. Nothing here blocks saving:
 * a school may have its reasons, and a misread PDF has to be fixable a step at
 * a time.
 */
export function curriculumIssues(courses: CurriculumCourseRow[], analysis?: CurriculumAnalysis | null): CurriculumIssue[] {
  const issues: CurriculumIssue[] = [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const codes = new Set(courses.map((c) => matchKey(c.code)));

  for (const stated of analysis?.stated_units ?? []) {
    const inTerm = courses.filter((c) => c.year_level === stated.year_level && c.term === stated.term);
    const total = sumUnits(inTerm);
    if (total !== stated.units) {
      issues.push({
        key: `units:${stated.year_level}:${stated.term}`,
        course_id: null,
        message: `${termPlace(stated)}: the PDF totals ${stated.units} units, but these courses add up to ${total}. A course or its units may have been misread.`,
      });
    }
  }

  for (const loop of prerequisiteLoops(courses)) {
    const names = [...loop, loop[0]].map((c) => c.code).join(' → ');
    issues.push({
      key: `loop:${loop.map((c) => c.id).sort().join(':')}`,
      course_id: loop[0].id,
      message: `Circular pre-requisites: ${names}. No student could ever take these.`,
    });
  }

  for (const course of courses) {
    for (const id of course.prerequisite_ids) {
      const needed = byId.get(id);
      if (!needed) continue;
      const gap = termRank(needed) - termRank(course);
      if (gap === 0) {
        issues.push({
          key: `pre-same:${course.id}:${id}`,
          course_id: course.id,
          message: `${course.code} needs ${needed.code} first, but both are in the ${termPlace(course)}.`,
        });
      } else if (gap > 0) {
        issues.push({
          key: `pre-later:${course.id}:${id}`,
          course_id: course.id,
          message: `${course.code} needs ${needed.code} first, but ${needed.code} comes later (${termPlace(needed)}).`,
        });
      }
    }
    for (const id of course.corequisite_ids) {
      const other = byId.get(id);
      // A co-requisite is stored both ways; report the pair once.
      if (!other || course.id > id || termRank(other) === termRank(course)) continue;
      issues.push({
        key: `co:${course.id}:${id}`,
        course_id: course.id,
        message: `${course.code} and ${other.code} are co-requisites, but they aren't in the same term.`,
      });
    }
    const missing = [...new Set(course.requisite_note.match(CODE_IN_TEXT) ?? [])].filter(
      (code) => !NOT_A_CODE.test(code) && !codes.has(matchKey(code)),
    );
    if (missing.length > 0) {
      issues.push({
        key: `missing:${course.id}`,
        course_id: course.id,
        message: `${course.code} names ${missing.join(', ')}, which ${missing.length === 1 ? "isn't a course" : "aren't courses"} in this curriculum.`,
      });
    }
    if (courseUnits(course) === 0) {
      issues.push({ key: `units0:${course.id}`, course_id: course.id, message: `${course.code} has no units.` });
    }
  }
  return issues;
}

/**
 * Warnings for a course being edited, against the term it is now set to, so the
 * form can say why a pick looks wrong while it is being made.
 */
export function requisitePlacement(
  place: { year_level: number; term: number },
  prerequisites: CurriculumCourseRow[],
  corequisites: CurriculumCourseRow[],
): string[] {
  const out: string[] = [];
  for (const c of prerequisites) {
    if (termRank(c) === termRank(place)) out.push(`${c.code} is in this same term, so it can't be passed first.`);
    else if (termRank(c) > termRank(place)) out.push(`${c.code} comes later (${termPlace(c)}).`);
  }
  for (const c of corequisites) {
    if (termRank(c) !== termRank(place)) out.push(`${c.code} is in another term (${termPlace(c)}).`);
  }
  return out;
}

/** The figures on the page's tiles. */
export function curriculumStats(courses: CurriculumCourseRow[]) {
  return {
    courses: courses.length,
    units: sumUnits(courses),
    lecture: roundUnits(courses.reduce((n, c) => n + c.lecture_units, 0)),
    lab: roundUnits(courses.reduce((n, c) => n + c.lab_units, 0)),
    years: new Set(courses.map((c) => c.year_level)).size,
    prerequisites: courses.reduce((n, c) => n + c.prerequisite_ids.length, 0),
    // Stored both ways, so each pair counts twice.
    corequisites: Math.round(courses.reduce((n, c) => n + c.corequisite_ids.length, 0) / 2),
  };
}

/** Courses grouped for the page and the course pickers: year levels, each with its terms, in order. */
export function byYearAndTerm(courses: CurriculumCourseRow[]) {
  const years = new Map<number, Map<number, CurriculumCourseRow[]>>();
  for (const course of inCurriculumOrder(courses)) {
    const terms = years.get(course.year_level) ?? new Map<number, CurriculumCourseRow[]>();
    terms.set(course.term, [...(terms.get(course.term) ?? []), course]);
    years.set(course.year_level, terms);
  }
  return [...years].map(([year, terms]) => ({
    year,
    terms: [...terms].map(([term, list]) => ({ term, courses: list })),
  }));
}

/** What Assign Course offers from the curriculum in use. */
export interface CatalogCourse {
  code: string;
  title: string;
  year: number;
  semester: number;
}

/** The curriculum's laboratory courses, the only ones that get assigned. */
export const catalogOf = (courses: Pick<CurriculumCourseRow, 'code' | 'title' | 'year_level' | 'term' | 'position'>[]): CatalogCourse[] =>
  inCurriculumOrder(courses.filter((c) => isLabCourse(c.code))).map((c) => ({
    code: c.code,
    title: c.title,
    year: c.year_level,
    semester: c.term,
  }));
