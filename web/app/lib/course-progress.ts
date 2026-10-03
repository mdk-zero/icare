/**
 * Courses, terms and semester requirements (migration 065): the rules every
 * reader shares. This module is pure — no server imports — so the pages, the
 * API routes and the in-browser demo all judge terms and requirements the
 * same way.
 */

/** "2026-08-10": a calendar date, as Postgres `date` columns come back. */
export type IsoDate = string;

export interface TermWindow {
  starts_on: IsoDate;
  ends_on: IsoDate;
}

export type TermStatus = 'upcoming' | 'current' | 'ended';

/**
 * The school runs on Philippine time, and nothing else in the app sets a
 * timezone, so a term's dates are read as Manila (UTC+8) calendar days.
 */
const MANILA_OFFSET = '+08:00';
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether the value is a real YYYY-MM-DD date (no 2026-02-30). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Today's date in Manila. */
export function manilaToday(now: Date = new Date()): IsoDate {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function termStatus(term: TermWindow, today: IsoDate = manilaToday()): TermStatus {
  if (today < term.starts_on) return 'upcoming';
  if (today > term.ends_on) return 'ended';
  return 'current';
}

/**
 * The instants work must be graded within to count for the term: from the
 * first day's midnight up to, not including, the midnight after the last day.
 */
export function termBounds(term: TermWindow): { from: string; to: string } {
  return {
    from: `${term.starts_on}T00:00:00${MANILA_OFFSET}`,
    to: `${addDays(term.ends_on, 1)}T00:00:00${MANILA_OFFSET}`,
  };
}

/** Whether a graded-at timestamp falls inside the term. */
export function inTerm(at: string | null | undefined, term: TermWindow): boolean {
  if (!at) return false;
  const t = new Date(at).getTime();
  const { from, to } = termBounds(term);
  return t >= new Date(from).getTime() && t < new Date(to).getTime();
}

export function termsOverlap(a: TermWindow, b: TermWindow): boolean {
  return a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Aug 10 – Dec 18, 2026", or "Jan 5, 2026 – May 22, 2027" across years. */
export function formatTermDates(term: TermWindow): string {
  const start = new Date(`${term.starts_on}T00:00:00Z`);
  const end = new Date(`${term.ends_on}T00:00:00Z`);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${(sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(start)} – ${MONTH_DAY_YEAR.format(end)}`;
}

export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  upcoming: 'Upcoming',
  current: 'Current',
  ended: 'Ended',
};

/** Field limits, matching the checks in migration 065. */
export const COURSE_LIMITS = {
  termName: 80,
  courseCode: 20,
  courseTitle: 120,
  courseDescription: 2000,
} as const;

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type RequirementKind = 'activity' | 'count' | 'skill' | 'manual';
/** scenario = Patient Case, assessment = Quiz; shift only for count items. */
export type ActivityType = 'scenario' | 'assessment' | 'case_presentation' | 'shift';

/** A course_requirements row. */
export interface RequirementRow {
  id: string;
  offering_id: string;
  position: number;
  kind: RequirementKind;
  title: string;
  activity_type: ActivityType | null;
  scenario_id: string | null;
  assessment_id: string | null;
  presentation_id: string | null;
  target_count: number | null;
  skill_id: string | null;
  /** null: graded is enough. */
  min_score: number | null;
  skills_only: boolean;
}

/** A course_requirement_checks row: a manual tick, or an override on an automatic item. */
export interface RequirementCheckRow {
  requirement_id: string;
  student_id: string;
  checked_by: string | null;
  checked_at: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TermInput {
  name: string;
  starts_on: IsoDate;
  ends_on: IsoDate;
}

export function parseTerm(body: Record<string, unknown>): Parsed<TermInput> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, error: 'Term name is required' };
  if (name.length > COURSE_LIMITS.termName) {
    return { ok: false, error: `Term name is too long (max ${COURSE_LIMITS.termName} characters)` };
  }
  if (!isIsoDate(body.starts_on) || !isIsoDate(body.ends_on)) {
    return { ok: false, error: 'Start and end dates are required' };
  }
  if (body.ends_on < body.starts_on) return { ok: false, error: 'The term must end on or after its start date' };
  return { ok: true, value: { name, starts_on: body.starts_on, ends_on: body.ends_on } };
}

export interface CourseInput {
  code: string;
  title: string;
  description: string;
}

export function parseCourse(body: Record<string, unknown>): Parsed<CourseInput> {
  const code = typeof body.code === 'string' ? body.code.trim().replace(/\s+/g, ' ') : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!code) return { ok: false, error: 'Course code is required' };
  if (code.length > COURSE_LIMITS.courseCode) {
    return { ok: false, error: `Course code is too long (max ${COURSE_LIMITS.courseCode} characters)` };
  }
  if (!title) return { ok: false, error: 'Course title is required' };
  if (title.length > COURSE_LIMITS.courseTitle) {
    return { ok: false, error: `Course title is too long (max ${COURSE_LIMITS.courseTitle} characters)` };
  }
  if (description.length > COURSE_LIMITS.courseDescription) {
    return { ok: false, error: `Description is too long (max ${COURSE_LIMITS.courseDescription} characters)` };
  }
  return { ok: true, value: { code, title, description } };
}
