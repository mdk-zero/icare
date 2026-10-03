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

/** Fields an instructor sets on a checklist item. */
export type RequirementInput = Omit<RequirementRow, 'id' | 'offering_id' | 'position'>;

export const MAX_REQUIREMENTS = 100;
export const MAX_REQUIREMENT_TITLE = 200;
export const MAX_TARGET_COUNT = 200;

const ACTIVITY_LINK = {
  scenario: 'scenario_id',
  assessment: 'assessment_id',
  case_presentation: 'presentation_id',
} as const;

function optionalScore(value: unknown): Parsed<number | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Minimum score must be between 0 and 100' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * Check a checklist item's fields and normalise everything that does not
 * apply to its kind to null — the same shape rule the database enforces
 * (065 course_requirements_shape_ck). Whether a linked activity or skill
 * exists is for the caller to check.
 */
export function parseRequirement(body: Record<string, unknown>): Parsed<RequirementInput> {
  const kind = body.kind;
  if (kind !== 'activity' && kind !== 'count' && kind !== 'skill' && kind !== 'manual') {
    return { ok: false, error: 'Choose what kind of requirement this is' };
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length > MAX_REQUIREMENT_TITLE) {
    return { ok: false, error: `Title is too long (max ${MAX_REQUIREMENT_TITLE} characters)` };
  }
  const score = optionalScore(body.min_score);
  if (!score.ok) return score;

  const base: RequirementInput = {
    kind,
    title,
    activity_type: null,
    scenario_id: null,
    assessment_id: null,
    presentation_id: null,
    target_count: null,
    skill_id: null,
    min_score: null,
    skills_only: false,
  };

  if (kind === 'manual') {
    if (!title) return { ok: false, error: 'Describe the requirement' };
    return { ok: true, value: base };
  }

  if (kind === 'skill') {
    if (typeof body.skill_id !== 'string' || !body.skill_id) return { ok: false, error: 'Choose a skill' };
    return { ok: true, value: { ...base, skill_id: body.skill_id, min_score: score.value } };
  }

  const type = body.activity_type;
  if (kind === 'activity') {
    if (type !== 'scenario' && type !== 'assessment' && type !== 'case_presentation') {
      return { ok: false, error: 'Choose a Patient Case, Quiz or Case Presentation' };
    }
    const link = ACTIVITY_LINK[type];
    const id = body[link];
    if (typeof id !== 'string' || !id) return { ok: false, error: 'Choose which one' };
    return { ok: true, value: { ...base, activity_type: type, [link]: id, min_score: score.value } };
  }

  // count
  if (type !== 'scenario' && type !== 'assessment' && type !== 'case_presentation' && type !== 'shift') {
    return { ok: false, error: 'Choose what to count' };
  }
  const target = typeof body.target_count === 'number' ? body.target_count : Number(body.target_count);
  if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET_COUNT) {
    return { ok: false, error: `The number must be a whole number from 1 to ${MAX_TARGET_COUNT}` };
  }
  return {
    ok: true,
    value: {
      ...base,
      activity_type: type,
      target_count: target,
      min_score: type === 'shift' ? null : score.value,
      skills_only: (type === 'scenario' || type === 'assessment') && body.skills_only === true,
    },
  };
}

/** Score thresholds offered for skill items, matching the rating bands in task-ratings.ts. */
export const SKILL_LEVELS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any graded work' },
  { value: 50, label: 'Satisfactory or better' },
  { value: 83, label: 'Excellent' },
];

/** Titles of what checklist items link to, for their labels. */
export interface RequirementNames {
  scenarios: Record<string, string>;
  quizzes: Record<string, string>;
  presentations: Record<string, string>;
  skills: Record<string, string>;
}

const COUNT_NOUN: Record<ActivityType, [string, string]> = {
  scenario: ['Patient Case', 'Patient Cases'],
  assessment: ['Quiz', 'Quizzes'],
  case_presentation: ['Case Presentation', 'Case Presentations'],
  shift: ['shift', 'shifts'],
};

function scoreSuffix(min: number | null): string {
  return min === null ? '' : ` · ${Number(min)}%+`;
}

/** Whether a linked activity was deleted after the item was made. */
export function isRemovedActivity(req: RequirementRow): boolean {
  return req.kind === 'activity' && !req.scenario_id && !req.assessment_id && !req.presentation_id;
}

/**
 * What an item asks for, in words: "5 Patient Cases graded", "Quiz: A Full
 * Set of Vital Signs · 75%+", "Skill 1-7 · Assessing Brachial Artery Blood
 * Pressure (Satisfactory or better)". Web and mobile show the same text.
 */
export function requirementLabel(req: RequirementRow, names: RequirementNames): string {
  switch (req.kind) {
    case 'manual':
      return req.title;
    case 'skill': {
      const level = SKILL_LEVELS.find((l) => l.value === (req.min_score === null ? null : Number(req.min_score)));
      const title = req.skill_id ? names.skills[req.skill_id] : null;
      const levelText = level ? level.label : `${Number(req.min_score)}%+`;
      return `Skill ${req.skill_id}${title ? ` · ${title}` : ''} (${levelText.toLowerCase()})`;
    }
    case 'activity': {
      if (isRemovedActivity(req)) return `Removed ${COUNT_NOUN[req.activity_type ?? 'scenario'][0]}`;
      const [noun] = COUNT_NOUN[req.activity_type ?? 'scenario'];
      const title =
        (req.scenario_id && names.scenarios[req.scenario_id]) ||
        (req.assessment_id && names.quizzes[req.assessment_id]) ||
        (req.presentation_id && names.presentations[req.presentation_id]) ||
        'Untitled';
      return `${noun}: ${title}${scoreSuffix(req.min_score)}`;
    }
    case 'count': {
      const type = req.activity_type ?? 'scenario';
      const n = req.target_count ?? 1;
      const noun = COUNT_NOUN[type][n === 1 ? 0 : 1];
      const verb =
        type === 'shift' ? 'attended' : type === 'assessment' ? (req.min_score === null ? 'completed' : 'passed') : 'graded';
      const min = type === 'assessment' && req.min_score !== null ? ` at ${Number(req.min_score)}%+` : scoreSuffix(type === 'assessment' ? null : req.min_score);
      return `${n} ${noun} ${verb}${min}${req.skills_only ? ' (course skills only)' : ''}`;
    }
  }
}
