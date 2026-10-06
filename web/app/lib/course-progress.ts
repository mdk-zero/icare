/**
 * Courses, terms and semester requirements (migration 065): the rules every
 * reader shares. This module is pure — no server imports — so the pages, the
 * API routes and the in-browser demo all judge terms and requirements the
 * same way.
 */

import { ratingForCredit, ratingLabel } from './task-ratings';

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

/** The kind of work an item is about, which names it. Manual items are hands-on lab work. */
const TOPIC: Record<ActivityType, string> = {
  scenario: 'Patient Case',
  assessment: 'Quiz',
  case_presentation: 'Case Presentation',
  shift: 'Attendance',
};

export function requirementTopic(req: Pick<RequirementRow, 'kind' | 'activity_type'>): string {
  if (req.kind === 'skill') return 'Skill';
  if (req.kind === 'manual') return 'Lab Activity';
  return TOPIC[req.activity_type ?? 'scenario'];
}

/**
 * What the course pages call each item, numbered within its topic in
 * checklist order: "Quiz #1", "Skill #2", "Patient Case #1". Pass the whole
 * checklist, sorted, since positions keep gaps after a removal.
 */
export function requirementNames(requirements: readonly Pick<RequirementRow, 'kind' | 'activity_type'>[]): string[] {
  const seen = new Map<string, number>();
  return requirements.map((r) => {
    const topic = requirementTopic(r);
    const n = (seen.get(topic) ?? 0) + 1;
    seen.set(topic, n);
    return `${topic} #${n}`;
  });
}

/** What an item asks for: the instructor's own label, if any, then requirementLabel(). */
export function requirementDetail(req: Pick<RequirementRow, 'kind' | 'title'> & { label: string }): string {
  return req.title && req.kind !== 'manual' ? `${req.title} — ${req.label}` : req.label;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** A finalized Patient Case, with the credit (0–1) each of its skill tasks earned. */
export interface GradedCaseFact {
  student_id: string;
  scenario_id: string;
  score: number | null;
  completed_at: string;
  skills: { skill_id: string; credit: number }[];
}

/** A submitted Quiz attempt, with its score on each skill it has a criterion for. */
export interface QuizAttemptFact {
  student_id: string;
  assessment_id: string;
  score: number | null;
  submitted_at: string;
  skill_scores: Record<string, number>;
}

export interface GradedPresentationFact {
  student_id: string;
  presentation_id: string;
  score: number | null;
  graded_at: string;
}

/** A shift the student was present (or late) for. */
export interface AttendedShiftFact {
  student_id: string;
  starts_at: string;
}

/** The graded work the checklist is judged on. Rows outside the term are ignored. */
export interface ProgressFacts {
  cases: GradedCaseFact[];
  attempts: QuizAttemptFact[];
  /** Each Quiz's skills, from its criteria and questions. */
  quizSkills: Record<string, string[]>;
  presentations: GradedPresentationFact[];
  shifts: AttendedShiftFact[];
  checks: RequirementCheckRow[];
}

export const NO_FACTS: ProgressFacts = { cases: [], attempts: [], quizSkills: {}, presentations: [], shifts: [], checks: [] };

export interface ItemProgress {
  done: boolean;
  /** graded: met by graded work. instructor: ticked (manual) or marked done by the instructor. */
  source: 'graded' | 'instructor' | null;
  /** Count items: qualifying work so far. Others: 1 when met, else 0. */
  current: number;
  target: number;
  /** When it was first met. */
  done_at: string | null;
  /** The best qualifying score seen, for activity and skill items. */
  best_score: number | null;
  /**
   * Count items over scored work: the mean of every score of that kind in the
   * term, met or not (each Quiz at its best attempt). Null for shifts.
   */
  avg_score: number | null;
  /** Skill items: the band of the best evidence ("Satisfactory"), or null with none. */
  level: string | null;
  /** The instructor's note on a tick or a mark-done. */
  note: string | null;
}

/** "Excellent" / "Satisfactory" / "Needs Practice", the bands of task-ratings.ts. */
export function scoreBand(score: number): string {
  return ratingLabel(ratingForCredit(score / 100));
}

const meets = (score: number | null, min: number | null) => min === null || (score !== null && score >= min);
const earliest = (dates: string[]) => (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null);
const max = (scores: (number | null)[]) => {
  const real = scores.filter((s): s is number => s !== null);
  return real.length ? Math.max(...real) : null;
};
const mean = (scores: (number | null)[]) => {
  const real = scores.filter((s): s is number => s !== null);
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
};

/**
 * Judge every student against every checklist item, from graded work inside
 * the term. Nothing automatic is stored: this runs on every read, so a grade
 * given a minute ago shows straight away. A manual item is met by the
 * instructor's tick; an automatic item is met by graded work, or by the
 * instructor marking it done (an override with a note).
 */
export function evaluate(
  requirements: readonly RequirementRow[],
  courseSkillIds: readonly string[],
  term: TermWindow,
  studentIds: readonly string[],
  facts: ProgressFacts,
): Record<string, Record<string, ItemProgress>> {
  const inside = <T>(rows: T[], at: (row: T) => string | null) => rows.filter((r) => inTerm(at(r), term));
  const cases = inside(facts.cases, (c) => c.completed_at);
  const attempts = inside(facts.attempts, (a) => a.submitted_at);
  const presentations = inside(facts.presentations, (p) => p.graded_at);
  const shifts = inside(facts.shifts, (s) => s.starts_at);
  const courseSkills = new Set(courseSkillIds);
  const check = new Map(facts.checks.map((c) => [`${c.requirement_id}:${c.student_id}`, c]));

  const result: Record<string, Record<string, ItemProgress>> = {};
  for (const studentId of studentIds) {
    const own = {
      cases: cases.filter((c) => c.student_id === studentId),
      attempts: attempts.filter((a) => a.student_id === studentId),
      presentations: presentations.filter((p) => p.student_id === studentId),
      shifts: shifts.filter((s) => s.student_id === studentId),
    };
    const row: Record<string, ItemProgress> = {};
    for (const req of requirements) {
      const auto = judge(req, own, facts.quizSkills, courseSkills);
      const tick = check.get(`${req.id}:${studentId}`);
      if (auto.done) {
        row[req.id] = { ...auto, source: 'graded', note: null };
      } else if (tick) {
        row[req.id] = { ...auto, done: true, source: 'instructor', done_at: tick.checked_at, note: tick.note || null };
      } else {
        row[req.id] = { ...auto, source: null, note: null };
      }
    }
    result[studentId] = row;
  }
  return result;
}

type Judged = Omit<ItemProgress, 'source' | 'note'>;

function judge(
  req: RequirementRow,
  own: { cases: GradedCaseFact[]; attempts: QuizAttemptFact[]; presentations: GradedPresentationFact[]; shifts: AttendedShiftFact[] },
  quizSkills: Record<string, string[]>,
  courseSkills: Set<string>,
): Judged {
  const none: Judged = { done: false, current: 0, target: 1, done_at: null, best_score: null, avg_score: null, level: null };
  const single = (qualifying: { at: string; score: number | null }[], all: (number | null)[]): Judged => {
    const doneAt = earliest(qualifying.map((q) => q.at));
    return { done: doneAt !== null, current: doneAt ? 1 : 0, target: 1, done_at: doneAt, best_score: max(all), avg_score: null, level: null };
  };
  const min = req.min_score;

  switch (req.kind) {
    case 'manual':
      return none;

    case 'activity': {
      if (req.scenario_id) {
        const mine = own.cases.filter((c) => c.scenario_id === req.scenario_id);
        return single(mine.filter((c) => meets(c.score, min)).map((c) => ({ at: c.completed_at, score: c.score })), mine.map((c) => c.score));
      }
      if (req.assessment_id) {
        const mine = own.attempts.filter((a) => a.assessment_id === req.assessment_id);
        return single(mine.filter((a) => meets(a.score, min)).map((a) => ({ at: a.submitted_at, score: a.score })), mine.map((a) => a.score));
      }
      if (req.presentation_id) {
        const mine = own.presentations.filter((p) => p.presentation_id === req.presentation_id);
        return single(mine.filter((p) => meets(p.score, min)).map((p) => ({ at: p.graded_at, score: p.score })), mine.map((p) => p.score));
      }
      return none; // the linked activity was deleted
    }

    case 'count': {
      const target = req.target_count ?? 1;
      const covers = (skills: string[]) => !req.skills_only || skills.some((s) => courseSkills.has(s));
      let dates: string[];
      // Every score of the kind, met or not, for the average.
      let scores: (number | null)[] = [];
      switch (req.activity_type) {
        case 'scenario': {
          const mine = own.cases.filter((c) => covers(c.skills.map((s) => s.skill_id)));
          dates = mine.filter((c) => meets(c.score, min)).map((c) => c.completed_at);
          scores = mine.map((c) => c.score);
          break;
        }
        case 'assessment': {
          // Each Quiz counts once, from its first qualifying attempt, and
          // averages in at its best attempt.
          const first = new Map<string, string>();
          const best = new Map<string, number | null>();
          for (const a of own.attempts) {
            if (!covers(quizSkills[a.assessment_id] ?? [])) continue;
            best.set(a.assessment_id, max([best.get(a.assessment_id) ?? null, a.score]));
            if (!meets(a.score, min)) continue;
            const seen = first.get(a.assessment_id);
            if (!seen || a.submitted_at < seen) first.set(a.assessment_id, a.submitted_at);
          }
          dates = [...first.values()];
          scores = [...best.values()];
          break;
        }
        case 'case_presentation':
          dates = own.presentations.filter((p) => meets(p.score, min)).map((p) => p.graded_at);
          scores = own.presentations.map((p) => p.score);
          break;
        case 'shift':
          dates = own.shifts.map((s) => s.starts_at);
          break;
        default:
          dates = [];
      }
      dates.sort();
      const done = dates.length >= target;
      return {
        done,
        current: dates.length,
        target,
        done_at: done ? dates[target - 1] : null,
        best_score: null,
        avg_score: mean(scores),
        level: null,
      };
    }

    case 'skill': {
      const skill = req.skill_id;
      if (!skill) return none;
      const evidence: { at: string; score: number }[] = [];
      for (const c of own.cases) {
        for (const s of c.skills) {
          // A task the student did not perform earns no credit and is no evidence.
          if (s.skill_id === skill && s.credit > 0) evidence.push({ at: c.completed_at, score: Math.round(s.credit * 100) });
        }
      }
      for (const a of own.attempts) {
        if (!(quizSkills[a.assessment_id] ?? []).includes(skill)) continue;
        const score = a.skill_scores[skill] ?? a.score;
        if (score !== null) evidence.push({ at: a.submitted_at, score });
      }
      const best = max(evidence.map((e) => e.score));
      const doneAt = earliest(evidence.filter((e) => e.score >= (min ?? 0)).map((e) => e.at));
      return {
        done: doneAt !== null,
        current: doneAt ? 1 : 0,
        target: 1,
        done_at: doneAt,
        best_score: best,
        avg_score: null,
        level: best === null ? null : scoreBand(best),
      };
    }
  }
}

/** How many of the checklist's items a student has met. */
export function summarize(row: Record<string, ItemProgress> | undefined, requirements: readonly RequirementRow[]) {
  return { done: requirements.filter((r) => row?.[r.id]?.done).length, total: requirements.length };
}
