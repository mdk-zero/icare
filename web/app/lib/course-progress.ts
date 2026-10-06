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

/**
 * A course_requirement_scores row (066): the score a student earned on work
 * the app has no grade for, entered by the instructor.
 */
export interface RequirementScoreRow {
  id: string;
  requirement_id: string;
  student_id: string;
  score: number;
  note: string;
  entered_by: string | null;
  entered_at: string;
}

/** An entered score, as a cell carries it. */
export type ScoreEntry = Pick<RequirementScoreRow, 'id' | 'score' | 'note' | 'entered_at'>;

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

/** The kind of work an item is about, which names and groups it. Manual items are hands-on lab work. */
export type RequirementTopicKey = ActivityType | 'skill' | 'manual';

/** The order the checklist is shown in: graded app work, skills, hands-on lab work, attendance. */
export const TOPIC_ORDER: readonly RequirementTopicKey[] = ['scenario', 'assessment', 'case_presentation', 'skill', 'manual', 'shift'];

const TOPIC: Record<RequirementTopicKey, string> = {
  scenario: 'Patient Case',
  assessment: 'Quiz',
  case_presentation: 'Case Presentation',
  skill: 'Skill',
  manual: 'Lab Activity',
  shift: 'Attendance',
};

export function topicKey(req: Pick<RequirementRow, 'kind' | 'activity_type'>): RequirementTopicKey {
  if (req.kind === 'skill' || req.kind === 'manual') return req.kind;
  return req.activity_type ?? 'scenario';
}

export function requirementTopic(req: Pick<RequirementRow, 'kind' | 'activity_type'>): string {
  return TOPIC[topicKey(req)];
}

/** The checklist as it is shown: grouped by topic in TOPIC_ORDER, each group in checklist order. */
export function inTopicOrder<R extends Pick<RequirementRow, 'kind' | 'activity_type'>>(requirements: readonly R[]): R[] {
  const rank = (r: R) => TOPIC_ORDER.indexOf(topicKey(r));
  return requirements.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r);
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
  /** Scores the instructor entered (066). Not bound to the term: the item is. */
  scores: RequirementScoreRow[];
}

export const NO_FACTS: ProgressFacts = { cases: [], attempts: [], quizSkills: {}, presentations: [], shifts: [], checks: [], scores: [] };

export interface ItemProgress {
  done: boolean;
  /** graded: met by graded work. instructor: met by a score you entered, or your tick or mark. */
  source: 'graded' | 'instructor' | null;
  /** Count items: qualifying work so far. Others: 1 when met, else 0. */
  current: number;
  target: number;
  /** When it was first met. */
  done_at: string | null;
  /** The best score seen, graded or entered, for activity, skill and manual items. */
  best_score: number | null;
  /**
   * Count items over scored work: the mean of every score of that kind in the
   * term, met or not (each Quiz at its best attempt), entered scores
   * included. Null for shifts.
   */
  avg_score: number | null;
  /** Skill items: the band of the best evidence ("Satisfactory"), or null with none. */
  level: string | null;
  /** The student has graded work behind the item: an attempt, a case, skill evidence. */
  has_grade: boolean;
  /** Scores you entered for this student, oldest first. */
  entries: ScoreEntry[];
  /** A tick or mark-done without a score: shift marks, and ticks from before 066. */
  marked: boolean;
  /** The note on that tick or mark. */
  note: string | null;
}

/**
 * How an instructor fills an item in by hand. score: they enter the score
 * the student earned. mark: a shift count has no score, so they mark it done
 * with a note.
 */
export function entryMode(req: Pick<RequirementRow, 'kind' | 'activity_type'>): 'score' | 'mark' {
  return req.kind === 'count' && req.activity_type === 'shift' ? 'mark' : 'score';
}

/**
 * Why a score can't be entered now, or null when it can: on a Lab Activity
 * always (it replaces the one there), on an activity or skill only while the
 * student has no grade on it, and on a count, one more piece of work, until
 * it is met.
 */
export function scoreBlock(req: RequirementRow, item: ItemProgress | undefined): string | null {
  if (entryMode(req) !== 'score') return 'Attendance has no score: mark it done instead';
  if (isRemovedActivity(req)) return 'The linked activity was deleted';
  if (req.kind === 'manual') return null;
  if (req.kind === 'count') return item?.done ? 'Already met: no more scores are needed' : null;
  return item?.has_grade ? 'The student already has a grade on this; change it by regrading their work' : null;
}

export const canEnterScore = (req: RequirementRow, item: ItemProgress | undefined) => scoreBlock(req, item) === null;

export const MAX_SCORE_NOTE = 500;

/** An entered score: a number from 0 to 100, kept to two decimals, or null. */
export function parseScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
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
 * the term and the scores the instructor entered. Nothing automatic is
 * stored: this runs on every read, so a grade given a minute ago shows
 * straight away. An entered score counts like a grade (a count's extra
 * piece of work, a Lab Activity's result); a tick or mark without a score
 * (shift counts, and ticks from before 066) meets the item outright.
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
  const entered = new Map<string, ScoreEntry[]>();
  for (const row of [...(facts.scores ?? [])].sort((a, b) => a.entered_at.localeCompare(b.entered_at))) {
    const key = `${row.requirement_id}:${row.student_id}`;
    entered.set(key, [...(entered.get(key) ?? []), { id: row.id, score: Number(row.score), note: row.note, entered_at: row.entered_at }]);
  }

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
      const entries = entered.get(`${req.id}:${studentId}`) ?? [];
      const { by, ...auto } = judge(req, own, facts.quizSkills, courseSkills, entries);
      const tick = check.get(`${req.id}:${studentId}`);
      const base = { ...auto, entries, marked: !!tick, note: tick?.note || null };
      if (auto.done) {
        row[req.id] = { ...base, source: by };
      } else if (tick) {
        row[req.id] = { ...base, done: true, source: 'instructor', done_at: tick.checked_at };
      } else {
        row[req.id] = { ...base, source: null };
      }
    }
    result[studentId] = row;
  }
  return result;
}

type Judged = Omit<ItemProgress, 'source' | 'note' | 'entries' | 'marked'> & { by: ItemProgress['source'] };

type Evidence = { at: string; score: number | null };

function judge(
  req: RequirementRow,
  own: { cases: GradedCaseFact[]; attempts: QuizAttemptFact[]; presentations: GradedPresentationFact[]; shifts: AttendedShiftFact[] },
  quizSkills: Record<string, string[]>,
  courseSkills: Set<string>,
  entries: ScoreEntry[],
): Judged {
  const min = req.min_score;
  const enteredEvidence: Evidence[] = entries.map((e) => ({ at: e.entered_at, score: e.score }));
  // Met by graded work if it can be, else by an entered score.
  const once = (graded: Evidence[], level: (best: number | null) => string | null = () => null): Judged => {
    const gradedAt = earliest(graded.filter((g) => meets(g.score, min)).map((g) => g.at));
    const enteredAt = earliest(enteredEvidence.filter((e) => meets(e.score, min)).map((e) => e.at));
    const doneAt = gradedAt ?? enteredAt;
    const best = max([...graded, ...enteredEvidence].map((e) => e.score));
    return {
      done: doneAt !== null,
      by: gradedAt ? 'graded' : enteredAt ? 'instructor' : null,
      current: doneAt ? 1 : 0,
      target: 1,
      done_at: doneAt,
      best_score: best,
      avg_score: null,
      level: level(best),
      has_grade: graded.length > 0,
    };
  };

  switch (req.kind) {
    case 'manual':
      // No minimum: any score the instructor enters meets it.
      return once([]);

    case 'activity': {
      if (req.scenario_id) {
        return once(own.cases.filter((c) => c.scenario_id === req.scenario_id).map((c) => ({ at: c.completed_at, score: c.score })));
      }
      if (req.assessment_id) {
        return once(own.attempts.filter((a) => a.assessment_id === req.assessment_id).map((a) => ({ at: a.submitted_at, score: a.score })));
      }
      if (req.presentation_id) {
        return once(own.presentations.filter((p) => p.presentation_id === req.presentation_id).map((p) => ({ at: p.graded_at, score: p.score })));
      }
      // The linked activity was deleted.
      return { done: false, by: null, current: 0, target: 1, done_at: null, best_score: null, avg_score: null, level: null, has_grade: false };
    }

    case 'count': {
      const target = req.target_count ?? 1;
      const covers = (skills: string[]) => !req.skills_only || skills.some((s) => courseSkills.has(s));
      let dates: string[];
      // Every graded score of the kind, met or not, for the average.
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
      const hasGrade = dates.length > 0 || scores.length > 0;
      // Each entered score is one more piece of work (shifts take none).
      const extra = req.activity_type === 'shift' ? [] : entries;
      const graded = [...dates].sort();
      const all = [...graded, ...extra.filter((e) => meets(e.score, min)).map((e) => e.entered_at)].sort();
      const done = all.length >= target;
      const byGrades = graded.length >= target;
      return {
        done,
        by: byGrades ? 'graded' : done ? 'instructor' : null,
        current: all.length,
        target,
        done_at: byGrades ? graded[target - 1] : done ? all[target - 1] : null,
        best_score: null,
        avg_score: mean([...scores, ...extra.map((e) => e.score)]),
        level: null,
        has_grade: hasGrade,
      };
    }

    case 'skill': {
      const skill = req.skill_id;
      if (!skill) return once([]);
      const evidence: Evidence[] = [];
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
      // A skill's minimum is a band (Satisfactory 50, Excellent 83); none means any evidence.
      return once(evidence, (best) => (best === null ? null : scoreBand(best)));
    }
  }
}

/** A course card's figures, for a running term. */
export interface OfferingSummary {
  students: number;
  /** Met every item. */
  complete: number;
  /** Met some items, not all. */
  in_progress: number;
  /** Lab Activities (manual items) still waiting for a score, across the roster. */
  to_score: number;
}

export function offeringSummary(
  requirements: readonly RequirementRow[],
  students: readonly { id: string; done: number; total: number }[],
  progress: Record<string, Record<string, ItemProgress>>,
): OfferingSummary {
  const labs = requirements.filter((r) => r.kind === 'manual');
  return {
    students: students.length,
    complete: students.filter((s) => s.total > 0 && s.done === s.total).length,
    in_progress: students.filter((s) => s.done > 0 && s.done < s.total).length,
    to_score: students.reduce((n, s) => n + labs.filter((r) => !progress[s.id]?.[r.id]?.done).length, 0),
  };
}

/** How many of the checklist's items a student has met. */
export function summarize(row: Record<string, ItemProgress> | undefined, requirements: readonly RequirementRow[]) {
  return { done: requirements.filter((r) => row?.[r.id]?.done).length, total: requirements.length };
}
