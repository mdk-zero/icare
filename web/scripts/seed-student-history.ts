/**
 * A real-world simulation of a class, for testing. Every result it writes is
 * made up.
 *
 * Who: the test institution only (campus ICARE-TEST), meaning its Dean's
 * students in Michael Smith's sections. It refuses a student under any other
 * Dean and reads only that Dean's cases and quizzes, so a real campus such as
 * Batangas State University can't be reached from here. Real evidence comes
 * from those campuses, which is why the ML service keeps this one apart
 * (ml/app/cohorts.py): at-risk training never reads it, and BKT reads it only
 * while no real student has a result.
 *
 * What makes it read like a class rather than a demo:
 *
 *   A spread. Most students are ordinary and a few are not, instead of 17
 *   students at 95% and 2 failing. PROFILES is calibrated against the one real
 *   cohort in this repo, OULAD (ml/data/oulad_holdout.csv): its passing
 *   students score a median of 81, 63 to 91 from the 10th to the 90th
 *   percentile, and hand in a median of 17% of their work late. Its failure
 *   rate is a distance-learning one, so this class fails fewer: about 1 in 5,
 *   which is an assumption, not a measurement.
 *
 *   Students who change. Some improve and some slide, block by block, and
 *   theory and bedside skill don't always agree (ability, handsOn, growth).
 *
 *   Questions that differ. A question's difficulty belongs to the question, so
 *   the same one is hard for the whole class, and wrong answers take longer.
 *   Guessing puts a floor under a four-option question.
 *
 *   The calendar of a real term. Quizzes are mostly sat in the evening, close
 *   to the deadline for those who leave things late, and some work comes in
 *   after it (the app flags late work, it doesn't block it). Instructors grade
 *   in person on the group's lab day, so a case can sit handed in and awaiting
 *   its grade. The newest block is still running, so some work is open today.
 *   There are empty days, because a real class has them.
 *
 * It is generated through the real code: papers from
 * selectQuestionsForAttempt(), competency standing from
 * deriveCompetencyScoresForAttempt() and case scores from scoreAssignment(). It
 * follows the groups: one case per group per block, each member scored alone.
 * Everything is deterministic per student and piece of work, but dates are
 * relative to the moment it runs.
 *
 * Re-runs and what it won't touch: it clears and rebuilds what it wrote for the
 * students in PROFILES, on the work in its catalog. Real work stays, and that
 * case or quiz is skipped for that student. Rows are told apart by the stamps
 * below: every seeded rating is dated exactly at its assignment's completed_at,
 * and every seeded hand-in exactly time_taken after its start, neither of which
 * the app lands on. The main run also clears those students' untouched
 * assignments on the Dean's other work, or leftover test assignments would count
 * as missed work.
 *
 *   npx tsx scripts/seed-student-history.ts --dry-run   report the plan, write nothing
 *   npx tsx scripts/seed-student-history.ts
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SelectionError, selectQuestionsForAttempt, type SelectionResult } from '../app/lib/assessment-selection';
import { attemptLimit } from '../app/lib/quiz-attempts';
import { deriveCompetencyScoresForAttempt } from '../app/lib/competency';
import { scoreAssignment } from '../app/lib/scenario-tasks';
import { ratingForCredit, TASK_RATINGS, type TaskRating } from '../app/lib/task-ratings';

config({ path: '.env.local' });

const TEST_CAMPUS = 'ICARE-TEST';
const TEST_INSTRUCTOR = 'Michael Smith';

/** Deterministic RNG (mulberry32), so a re-run reproduces the same class. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const logit = (p: number) => Math.log(p / (1 - p));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
/** A bell-shaped draw: mean 0, standard deviation 1. */
const bell = (rng: () => number) => (rng() + rng() + rng() - 1.5) * 2;

export interface Profile {
  email: string;
  name: string;
  section: string;
  sex: 'male' | 'female';
  /** Share of quiz questions they get right at the start of the term, guesses included. */
  ability: number;
  /**
   * Skill areas (Taylor's chapters) this student reliably misses, and reliably
   * gets. Only chapters their work tests have any effect.
   */
  weakAt: string[];
  strongAt: string[];
  /** Share of a case's tasks they perform before it is graded. */
  taskCompletion: number;
  /**
   * Share of the term they stayed for, 0..1. Past it they stop: the work is
   * assigned and untouched, and reads as overdue once its deadline passes.
   */
  engagement: number;
  /**
   * Chance a checklist step earns Excellent at the bedside. Defaults to ability.
   * On the grade scale, 0.1 is about a 66, 0.2 a 73, 0.3 a 78, 0.4 an 83, 0.6 a 90.
   */
  handsOn?: number;
  /** How far they move per block, in log-odds. Negative for a student sliding. */
  growth?: number;
  /** Where in a window they work: 0 is the last hours, 1 as soon as it opens. */
  punctuality?: number;
  /** Chance a piece of work comes in after its deadline. */
  lateness?: number;
  /** Chance they never do a given piece of work, while still coming to class. */
  skips?: number;
  /** Chance they go back for a review quiz after a graded try. */
  reviews?: number;
}

const DEFAULT_GROWTH = 0.2;
const DEFAULT_PUNCTUALITY = 0.55;
const DEFAULT_LATENESS = 0.08;
const DEFAULT_REVIEWS = 0.3;

/** In log-odds: how far a skill area moves a student's chances. */
const WEAK_AREA = -1.1;
const STRONG_AREA = 0.6;
/** A review re-asks what they got wrong, and they have seen the answer since. */
const SEEN_ANSWER = 0.9;

/**
 * Students in Michael Smith's BSN 1101 and BSN 1102 groups, as an ordinary
 * class. Case grades land about 1 in 5 under the 75 passing mark.
 *
 * The developer's own student account is not here on purpose: it holds real
 * attempts from testing the app by hand.
 */
export const PROFILES: Profile[] = [
  // ---- BSN 1101 -----------------------------------------------------------
  // Top of the class: early, and goes back over what they missed.
  { email: '23-80112@g.batstate-u.edu.ph', name: 'Bea R. Katigbak', section: 'BSN 1101', sex: 'female', ability: 0.86, handsOn: 0.62, growth: 0.15, punctuality: 0.8, lateness: 0, reviews: 0.6, weakAt: [], strongAt: ['Health Assessment'], taskCompletion: 1, engagement: 1 },
  { email: '23-80147@g.batstate-u.edu.ph', name: 'Miguel A. Panganiban', section: 'BSN 1101', sex: 'male', ability: 0.76, handsOn: 0.42, lateness: 0.08, weakAt: [], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 1 },
  // Crams: decent marks, always in the last hours, often past them.
  { email: '23-80233@g.batstate-u.edu.ph', name: 'Trisha Mae L. Macatangay', section: 'BSN 1101', sex: 'female', ability: 0.78, handsOn: 0.35, growth: 0.1, punctuality: 0.12, lateness: 0.35, reviews: 0.1, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },
  // Struggling but still here: skips some work, weak on the core skill.
  { email: '23-80318@g.batstate-u.edu.ph', name: 'Kenji P. Villanueva', section: 'BSN 1101', sex: 'male', ability: 0.58, handsOn: 0.13, growth: 0.1, punctuality: 0.3, lateness: 0.3, skips: 0.2, reviews: 0.1, weakAt: ['Vital Signs'], strongAt: [], taskCompletion: 0.9, engagement: 1 },
  { email: '23-80402@g.batstate-u.edu.ph', name: 'Angelica D. Manalo', section: 'BSN 1101', sex: 'female', ability: 0.84, handsOn: 0.58, punctuality: 0.75, lateness: 0.03, reviews: 0.5, weakAt: [], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 1 },
  // Good on paper, shaky at the bedside: passes quizzes, borderline on cases.
  { email: '23-12355@g.batstate-u.edu.ph', name: 'Miguel Fernandez', section: 'BSN 1101', sex: 'male', ability: 0.82, handsOn: 0.2, growth: 0.25, punctuality: 0.6, lateness: 0.05, reviews: 0.4, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },
  // The reverse: steady hands, weak on written work.
  { email: '23-12356@g.batstate-u.edu.ph', name: 'Bea Navarro', section: 'BSN 1101', sex: 'female', ability: 0.66, handsOn: 0.55, punctuality: 0.55, lateness: 0.1, weakAt: ['Health Assessment'], strongAt: [], taskCompletion: 1, engagement: 1 },
  // Starts badly and climbs: a low first block, a pass by the last.
  { email: '23-12357@g.batstate-u.edu.ph', name: 'Rafael Torres', section: 'BSN 1101', sex: 'male', ability: 0.62, handsOn: 0.15, growth: 0.55, punctuality: 0.4, lateness: 0.15, reviews: 0.5, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },
  { email: '23-12358@g.batstate-u.edu.ph', name: 'Camille Pascual', section: 'BSN 1101', sex: 'female', ability: 0.74, handsOn: 0.38, punctuality: 0.65, lateness: 0.08, reviews: 0.35, weakAt: [], strongAt: ['Health Assessment'], taskCompletion: 1, engagement: 1 },
  // Starts well and slides, the student a good first block hides.
  { email: '23-12359@g.batstate-u.edu.ph', name: 'Gabriel Soriano', section: 'BSN 1101', sex: 'male', ability: 0.8, handsOn: 0.45, growth: -0.6, punctuality: 0.5, lateness: 0.25, skips: 0.1, reviews: 0.2, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },

  // ---- BSN 1102 -----------------------------------------------------------
  { email: '23-75538@g.batstate-u.edu.ph', name: 'Andre A. Cachola', section: 'BSN 1102', sex: 'male', ability: 0.75, handsOn: 0.44, punctuality: 0.6, lateness: 0.06, weakAt: [], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 1 },
  { email: 'cacholaandot@gmail.com', name: 'Andot S. Wong', section: 'BSN 1102', sex: 'male', ability: 0.7, handsOn: 0.26, growth: 0.15, punctuality: 0.4, lateness: 0.15, reviews: 0.2, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },
  { email: 'dotdot042822@gmail.com', name: 'Dotdot I. Corpuz', section: 'BSN 1102', sex: 'male', ability: 0.72, handsOn: 0.33, punctuality: 0.5, lateness: 0.12, weakAt: [], strongAt: ['Health Assessment'], taskCompletion: 1, engagement: 1 },
  { email: '23-80519@g.batstate-u.edu.ph', name: 'Jomar T. Dimaculangan', section: 'BSN 1102', sex: 'male', ability: 0.88, handsOn: 0.65, growth: 0.1, punctuality: 0.85, lateness: 0, reviews: 0.5, weakAt: [], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 1 },
  { email: '23-80624@g.batstate-u.edu.ph', name: 'Shaira Mae B. Aguilar', section: 'BSN 1102', sex: 'female', ability: 0.77, handsOn: 0.42, punctuality: 0.6, lateness: 0.05, reviews: 0.4, weakAt: [], strongAt: [], taskCompletion: 1, engagement: 1 },
  // Another crammer, with less to spare.
  { email: '23-80730@g.batstate-u.edu.ph', name: 'Renz Carlo M. Ilagan', section: 'BSN 1102', sex: 'male', ability: 0.7, handsOn: 0.24, growth: 0.15, punctuality: 0.1, lateness: 0.4, reviews: 0.1, weakAt: ['Health Assessment'], strongAt: [], taskCompletion: 1, engagement: 1 },
  { email: '23-80845@g.batstate-u.edu.ph', name: 'Nicole Anne S. Perez', section: 'BSN 1102', sex: 'female', ability: 0.79, handsOn: 0.48, growth: 0.15, punctuality: 0.7, lateness: 0.03, reviews: 0.4, weakAt: [], strongAt: ['Health Assessment'], taskCompletion: 1, engagement: 1 },
  // Drifts away after the first block, the clearest signal a class produces.
  { email: '23-80951@g.batstate-u.edu.ph', name: 'Paulo G. Hernandez', section: 'BSN 1102', sex: 'male', ability: 0.55, handsOn: 0.1, growth: 0, punctuality: 0.25, lateness: 0.4, reviews: 0, weakAt: ['Vital Signs', 'Health Assessment'], strongAt: [], taskCompletion: 0.8, engagement: 0.34 },
];

export interface WorkItem {
  scenario: string;
  quiz: string;
}

// The test Dean's finished cases and published quizzes, as they stand on live.
const PNEUMONIA: WorkItem = { scenario: 'Community-Acquired Pneumonia: Respiratory and Pulse Assessment', quiz: 'Vital Signs: Pulse, Respiration, and Blood Pressure' };
const HEART_FAILURE: WorkItem = { scenario: 'Heart Failure: Cardiovascular Assessment', quiz: 'Vital Signs Fundamentals' };
const GASTROENTERITIS: WorkItem = { scenario: 'Acute Gastroenteritis: Abdominal and Skin Assessment', quiz: 'Health Assessment: General Survey, Skin, and Head and Neck' };

/**
 * The cases each section works through, in order, and so the quizzes its
 * students sit. A group starts this cycle at its own place (see groupWork).
 */
const SECTION_WORK: Record<string, WorkItem[]> = {
  'BSN 1101': [PNEUMONIA, HEART_FAILURE, GASTROENTERITIS],
  'BSN 1102': [GASTROENTERITIS, PNEUMONIA, HEART_FAILURE],
};

const RETURN_DEMOS = ['Chapter 1: Skill 1-7', 'Chapter 2: Skill 2-2'];

/**
 * A group's cases: its section's cycle, started at the group's place among the
 * section's groups, so a section's groups are on different cases in any block.
 */
function groupWork(work: WorkItem[], ordinal: number): WorkItem[] {
  const shift = ordinal % work.length;
  return [...work.slice(shift), ...work.slice(0, shift)];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MANILA_MS = 8 * HOUR_MS;
const END_OF_DAY = 23.98;

/** How much of the term the history covers. */
const TERM_WEEKS = 14;
/** The newest block began at least this long ago, so some of it is done and some isn't. */
const CURRENT_BLOCK_AGE_DAYS = 7;
const CASE_DAYS = 14;
/** A quiz opens once the group has started on the case. */
const QUIZ_OPENS_AFTER_DAYS = 4;
const QUIZ_DAYS = 10;
const DEMO_OPENS_AFTER_DAYS = 21;
const DEMO_DAYS = 10;
/** An instructor doesn't get to everyone: some grades wait for the next lab day. */
const NEXT_LAB_CHANCE = 0.25;

/** `hour` o'clock in Manila, on the day `ms` falls on there. */
function manilaAt(ms: number, hour: number): number {
  return Math.floor((ms + MANILA_MS) / DAY_MS) * DAY_MS - MANILA_MS + hour * HOUR_MS;
}

const manilaWeekday = (ms: number) => new Date(ms + MANILA_MS).getUTCDay();

/** The first `weekday` (0 is Sunday) on or after `ms`. */
function nextWeekday(ms: number, weekday: number): number {
  return ms + ((weekday - manilaWeekday(ms) + 7) % 7) * DAY_MS;
}

/** Block starts, one Monday morning each, the newest a little before today. */
function termBlocks(count: number, now: number): number[] {
  const newest = manilaAt(nextWeekday(now - (CURRENT_BLOCK_AGE_DAYS + 6) * DAY_MS, 1), 8);
  const length = Math.round(TERM_WEEKS / count) * 7 * DAY_MS;
  return Array.from({ length: count }, (_, k) => newest - (count - 1 - k) * length);
}

/** Most sit a quiz in the evening; some between classes. */
function homeHour(ms: number, rng: () => number): number {
  return manilaAt(ms, rng() < 0.7 ? 18 + rng() * 5.5 : 9 + rng() * 8);
}

/** Bedside work happens during school hours on a school day. */
function labHour(ms: number, rng: () => number): number {
  const weekday = manilaWeekday(ms);
  const shift = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  return manilaAt(ms + shift * DAY_MS, 8 + rng() * 8);
}

/** When a student does a piece of work open from `opens` to `due`. */
function workMoment(profile: Profile, opens: number, due: number, hour: (ms: number, rng: () => number) => number, rng: () => number): number {
  const late = rng() < (profile.lateness ?? DEFAULT_LATENESS);
  const share = clamp(1 - (profile.punctuality ?? DEFAULT_PUNCTUALITY) + (rng() - 0.5) * 0.35, 0.02, 0.97);
  const day = late ? due + (0.5 + rng() * 4.5) * DAY_MS : opens + share * (due - opens);
  return Math.round(hour(day, rng));
}

/** A question's or checklist step's own difficulty, in log-odds: the same for the whole class. */
function difficulty(id: string): number {
  return bell(seeded(hash(id))) * 0.6;
}

function areaEffect(profile: Profile, areas: string[]): number {
  let effect = 0;
  if (areas.some((a) => profile.weakAt.includes(a))) effect += WEAK_AREA;
  if (areas.some((a) => profile.strongAt.includes(a))) effect += STRONG_AREA;
  return effect;
}

/** Chance this student gets a question right in a given block of the term. */
export function answerChance(
  profile: Profile,
  areas: string[],
  question: { id: string; optionCount: number },
  block: number,
  seenAnswer: boolean,
): number {
  const guess = 1 / Math.max(2, question.optionCount);
  const knows = clamp((profile.ability - guess) / (1 - guess), 0.02, 0.98);
  const x =
    logit(knows) +
    areaEffect(profile, areas) +
    (profile.growth ?? DEFAULT_GROWTH) * block -
    difficulty(question.id) +
    (seenAnswer ? SEEN_ANSWER : 0);
  return Math.min(0.98, guess + (1 - guess) * logistic(x));
}

/**
 * Chance a checklist step earns Excellent. `form` is how this student's day is
 * going, shared by every step of one case, so one case can run well or badly.
 */
export function stepChance(profile: Profile, area: string, stepId: string, block: number, form: number): number {
  const x =
    logit(clamp(profile.handsOn ?? profile.ability, 0.02, 0.98)) +
    areaEffect(profile, area ? [area] : []) +
    (profile.growth ?? DEFAULT_GROWTH) * block +
    form -
    difficulty(stepId) * 0.5;
  return logistic(x);
}

/** A student's form on one case, in log-odds. */
export const dayForm = (rng: () => number) => bell(rng) * 0.35;

/**
 * Excellent as often as `p`. Short of that, a solid student is mostly
 * Satisfactory and a weak one mostly Needs Practice. It has to lean that hard:
 * the grade scale (scaledGrade) floors at 37.5, so an all-Satisfactory case earns
 * 79 and falling under 75 takes a run of Needs Practice.
 */
export function drawLevel(p: number, rng: () => number): TaskRating {
  const x = rng();
  if (x < p) return 'excellent';
  return x < 1 - (1 - p) ** 3 ? 'satisfactory' : 'needs_practice';
}

const REMARKS: Record<TaskRating, string[]> = {
  excellent: ['Confident and accurate throughout.', 'Performed every step without prompting.'],
  satisfactory: ['Correct technique, some hesitation.', 'Needed one prompt on the sequence.'],
  needs_practice: ['Missed steps; review the checklist.', 'Needs supervised practice before the next case.'],
};

/** Whether a hand-in carries the seed's stamp: exactly time_taken after its start. */
function stamped(startedAt: string | null, seconds: number | null, submittedAt: string | null): boolean {
  if (!startedAt || !submittedAt || seconds === null) return false;
  return Math.abs(Date.parse(submittedAt) - Date.parse(startedAt) - seconds * 1000) <= 1;
}

export interface SeedOptions {
  /** The Dean whose students and work this may touch. Anyone else's is out of reach. */
  deanId: string;
  /** Who assigns and grades. A student in a group someone else supervises stops the run. */
  instructorId: string;
  /** Return Demonstrations, one per block from the first. */
  returnDemos?: string[];
  /** Also clear these students' untouched assignments on the Dean's other work. */
  clearUntouched?: boolean;
  /** Report the plan and write nothing. */
  dryRun?: boolean;
}

interface CasePlan {
  title: string;
  scenarioId: string;
  block: number;
  assignedAt: number;
  deadline: number;
  handIn: number | null;
  gradedAt: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
}

interface QuizPlan {
  title: string;
  assessmentId: string;
  block: number;
  assignedAt: number;
  deadline: number;
  /** The graded try, then any reviews: only those that have happened by now. */
  sittings: number[];
  status: 'pending' | 'completed' | 'overdue';
}

interface Member {
  profile: Profile;
  studentId: string;
  teamId: string | null;
  didCount: number;
  cases: CasePlan[];
  quizzes: QuizPlan[];
  // What is already there.
  removeCases: string[];
  removeAttempts: string[];
  removeQuizAssignments: string[];
  /** Real work: these stay, and the plan skips them. */
  keptCases: Set<string>;
  keptQuizzes: Set<string>;
}

function planCase(
  profile: Profile,
  didCount: number,
  work: { title: string; scenarioId: string; block: number; opens: number; days: number; labDay: number },
  now: number,
): CasePlan {
  const rng = seeded(hash(`${profile.email}|${work.title}|plan`));
  const deadline = manilaAt(work.opens + work.days * DAY_MS, END_OF_DAY);
  const doesIt = work.block < didCount && rng() >= (profile.skips ?? 0);
  const planned = doesIt ? workMoment(profile, work.opens, deadline, labHour, rng) : null;
  const handIn = planned !== null && planned < now - HOUR_MS ? planned : null;
  let gradedAt: number | null = null;
  if (handIn !== null) {
    const lab = nextWeekday(handIn + 12 * HOUR_MS, work.labDay) + (rng() < NEXT_LAB_CHANCE ? 7 * DAY_MS : 0);
    const at = Math.round(manilaAt(lab, 13 + rng() * 4));
    if (at < now) gradedAt = at;
  }
  return {
    title: work.title,
    scenarioId: work.scenarioId,
    block: work.block,
    assignedAt: work.opens,
    deadline,
    handIn,
    gradedAt,
    status: gradedAt !== null ? 'completed' : handIn !== null ? 'in_progress' : deadline < now ? 'overdue' : 'pending',
  };
}

function planQuiz(
  profile: Profile,
  didCount: number,
  work: { title: string; assessmentId: string; block: number; opens: number },
  now: number,
): QuizPlan {
  const rng = seeded(hash(`${profile.email}|${work.title}|plan`));
  const deadline = manilaAt(work.opens + QUIZ_DAYS * DAY_MS, END_OF_DAY);
  const planned: number[] = [];
  if (work.block < didCount && rng() >= (profile.skips ?? 0)) {
    let at = workMoment(profile, work.opens, deadline, homeHour, rng);
    planned.push(at);
    // Likely once if they go back at all, less so again.
    let chance = profile.reviews ?? DEFAULT_REVIEWS;
    while (planned.length < 3 && rng() < chance) {
      at = Math.round(homeHour(at + (0.5 + rng() * 3) * DAY_MS, rng));
      planned.push(at);
      chance /= 2;
    }
  }
  const sittings = planned.filter((at) => at < now - 2 * HOUR_MS);
  return {
    title: work.title,
    assessmentId: work.assessmentId,
    block: work.block,
    assignedAt: work.opens,
    deadline,
    sittings,
    status: sittings.length > 0 ? 'completed' : deadline < now ? 'overdue' : 'pending',
  };
}

export async function seedHistory(profiles: Profile[], sectionWork: Record<string, WorkItem[]>, options: SeedOptions) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = Date.now();
  const returnDemos = options.returnDemos ?? [];

  // ---- Look up everything this seed refers to, under this Dean only ---------
  const [studentsRes, scenariosRes, assessmentsRes, competenciesRes, groupsRes, skillsRes, tagsRes, questionsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, sections!section_id(name)')
      .eq('role', 'student')
      .eq('admin_id', options.deanId)
      .in('email', profiles.map((p) => p.email)),
    supabase.from('scenarios').select('id, title').eq('admin_id', options.deanId),
    supabase.from('assessments').select('id, title, max_attempts, time_limit_seconds').eq('admin_id', options.deanId),
    supabase.from('competency_areas').select('id, name'),
    supabase.from('teams').select('id, name, section_id, faculty_id, team_members(student_id)'),
    supabase.from('taylor_skills').select('id, chapter_id'),
    supabase.from('question_competencies').select('question_id, competency_id'),
    supabase.from('questions').select('id, correct_index, options'),
  ]);
  for (const res of [studentsRes, scenariosRes, assessmentsRes, competenciesRes, groupsRes, skillsRes, tagsRes, questionsRes]) {
    if (res.error) throw new Error(`read: ${res.error.message}`);
  }
  const students = studentsRes.data ?? [];
  const scenarios = scenariosRes.data ?? [];
  const assessments = assessmentsRes.data ?? [];

  const scenarioByTitle = new Map(scenarios.map((s) => [s.title as string, s.id as string]));
  const assessmentByTitle = new Map(assessments.map((a) => [a.title as string, a.id as string]));
  const limitOfAssessment = new Map(assessments.map((a) => [a.id as string, attemptLimit(null, a.max_attempts)]));
  const secondsOfAssessment = new Map(assessments.map((a) => [a.id as string, a.time_limit_seconds as number | null]));
  const competencyName = new Map((competenciesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const chapterOfSkill = new Map((skillsRes.data ?? []).map((r) => [r.id as string, r.chapter_id as string]));

  // Strengths and weaknesses are matched to question tags by name, so a name
  // that is not a competency area would silently change nothing.
  const areaNames = new Set(competencyName.values());
  const unknown = profiles.flatMap((p) =>
    [...p.weakAt, ...p.strongAt].filter((name) => !areaNames.has(name)).map((name) => `${p.email}: "${name}"`),
  );
  if (unknown.length > 0) throw new Error(`Profiles name competencies that do not exist:\n  ${unknown.join('\n  ')}`);

  const catalog = Object.values(sectionWork).flat();
  const catalogScenarioTitles = [...new Set([...catalog.map((i) => i.scenario), ...returnDemos])];
  const catalogQuizTitles = [...new Set(catalog.map((i) => i.quiz))];
  const absent = [
    ...catalogScenarioTitles.filter((t) => !scenarioByTitle.has(t)),
    ...catalogQuizTitles.filter((t) => !assessmentByTitle.has(t)),
  ];
  if (absent.length > 0) throw new Error(`This Dean doesn't have:\n  ${absent.join('\n  ')}`);
  const catalogScenarios = new Set(catalogScenarioTitles.map((t) => scenarioByTitle.get(t)!));
  const catalogQuizzes = new Set(catalogQuizTitles.map((t) => assessmentByTitle.get(t)!));

  // Groups: each member's group, its supervisor, and the group's place among
  // its section's groups (by name), which picks the group's case.
  const sortedGroups = [...(groupsRes.data ?? [])].sort((a, b) =>
    (a.name as string).localeCompare(b.name as string, undefined, { numeric: true }),
  );
  const groupOf = new Map<string, { teamId: string; supervisor: string | null; ordinal: number }>();
  for (const g of sortedGroups) {
    const ordinal = sortedGroups.filter((o) => o.section_id === g.section_id).indexOf(g);
    for (const m of (g.team_members ?? []) as { student_id: string }[]) {
      groupOf.set(m.student_id, { teamId: g.id as string, supervisor: (g.faculty_id as string | null) ?? null, ordinal });
    }
  }

  // Every question's skill areas, so an answer reflects the student's actual
  // weaknesses rather than a coin flip.
  const areasOfQuestion = new Map<string, string[]>();
  for (const t of tagsRes.data ?? []) {
    const names = areasOfQuestion.get(t.question_id as string) ?? [];
    names.push(competencyName.get(t.competency_id as string) ?? '');
    areasOfQuestion.set(t.question_id as string, names);
  }
  const questionById = new Map((questionsRes.data ?? []).map((q) => [q.id as string, q]));

  // ---- Plan each student's term ---------------------------------------------
  const bySection = new Map<string, Member[]>();
  const refused: string[] = [];
  for (const profile of profiles) {
    const student = students.find((s) => s.email === profile.email);
    if (!student) {
      refused.push(`${profile.email}: not a student under this Dean`);
      continue;
    }
    const sectionName = (student as unknown as { sections: { name: string } | null }).sections?.name ?? '';
    const ownWork = sectionWork[sectionName];
    if (!ownWork) {
      refused.push(`${profile.email}: section "${sectionName}" has no work defined`);
      continue;
    }
    const group = groupOf.get(student.id as string) ?? null;
    if (group?.supervisor && group.supervisor !== options.instructorId) {
      refused.push(`${profile.email}: their group has another supervisor`);
      continue;
    }
    const work = group ? groupWork(ownWork, group.ordinal) : ownWork;
    const blocks = termBlocks(work.length, now);
    const didCount = Math.max(1, Math.round(profile.engagement * work.length));
    // Each group has its own lab day, Tuesday to Friday.
    const labDay = 2 + (hash(sectionName) % 2) + 2 * ((group?.ordinal ?? 0) % 2);
    const cases = work.map((item, block) =>
      planCase(profile, didCount, { title: item.scenario, scenarioId: scenarioByTitle.get(item.scenario)!, block, opens: blocks[block], days: CASE_DAYS, labDay }, now),
    );
    const demos = returnDemos.slice(0, blocks.length).map((title, block) =>
      planCase(profile, didCount, { title, scenarioId: scenarioByTitle.get(title)!, block, opens: blocks[block] + DEMO_OPENS_AFTER_DAYS * DAY_MS, days: DEMO_DAYS, labDay }, now),
    );
    const quizzes = work.map((item, block) =>
      planQuiz(profile, didCount, { title: item.quiz, assessmentId: assessmentByTitle.get(item.quiz)!, block, opens: blocks[block] + QUIZ_OPENS_AFTER_DAYS * DAY_MS }, now),
    );
    const members = bySection.get(sectionName) ?? [];
    members.push({
      profile,
      studentId: student.id as string,
      teamId: group?.teamId ?? null,
      didCount,
      cases: [...cases, ...demos],
      quizzes,
      removeCases: [],
      removeAttempts: [],
      removeQuizAssignments: [],
      keptCases: new Set(),
      keptQuizzes: new Set(),
    });
    bySection.set(sectionName, members);
  }
  if (refused.length > 0) throw new Error(`Nothing was written. Refused:\n  ${refused.join('\n  ')}`);

  // ---- Sort what is already there into ours and real work -------------------
  const ownedScenarios = scenarios.map((s) => s.id as string);
  const ownedQuizzes = assessments.map((a) => a.id as string);
  const members = [...bySection.values()].flat();
  for (const member of members) {
    const [heldCases, heldAttempts, heldQuizzes] = await Promise.all([
      supabase
        .from('scenario_assignments')
        .select('id, scenario_id, started_at, submitted_at, completed_at, time_taken, scenario_task_step_ratings(rated_at)')
        .eq('student_id', member.studentId)
        .in('scenario_id', ownedScenarios),
      supabase
        .from('assessment_attempts')
        .select('id, assessment_id, status, started_at, submitted_at, time_taken_seconds')
        .eq('student_id', member.studentId)
        .in('assessment_id', ownedQuizzes),
      supabase.from('assessment_assignments').select('id, assessment_id').eq('student_id', member.studentId).in('assessment_id', ownedQuizzes),
    ]);
    if (heldCases.error || heldAttempts.error || heldQuizzes.error) {
      throw new Error(`read held work: ${(heldCases.error ?? heldAttempts.error ?? heldQuizzes.error)?.message}`);
    }
    for (const row of heldCases.data ?? []) {
      const scenarioId = row.scenario_id as string;
      const untouched = !row.started_at && !row.submitted_at && !row.completed_at;
      if (untouched) {
        if (catalogScenarios.has(scenarioId) || options.clearUntouched) member.removeCases.push(row.id as string);
        continue;
      }
      if (!catalogScenarios.has(scenarioId)) continue;
      const ratings = (row.scenario_task_step_ratings ?? []) as { rated_at: string }[];
      const ours =
        ratings.length > 0
          ? ratings.every((r) => Date.parse(r.rated_at) === Date.parse(row.completed_at as string))
          : stamped(row.started_at as string | null, row.time_taken as number | null, row.submitted_at as string | null);
      if (ours) member.removeCases.push(row.id as string);
      else member.keptCases.add(scenarioId);
    }
    const attemptedQuizzes = new Set<string>();
    for (const attempt of heldAttempts.data ?? []) {
      const assessmentId = attempt.assessment_id as string;
      attemptedQuizzes.add(assessmentId);
      if (!catalogQuizzes.has(assessmentId)) continue;
      const ours =
        attempt.status !== 'in_progress' &&
        stamped(attempt.started_at as string | null, attempt.time_taken_seconds as number | null, attempt.submitted_at as string | null);
      if (ours) member.removeAttempts.push(attempt.id as string);
      else member.keptQuizzes.add(assessmentId);
    }
    for (const row of heldQuizzes.data ?? []) {
      const assessmentId = row.assessment_id as string;
      if (catalogQuizzes.has(assessmentId)) {
        if (!member.keptQuizzes.has(assessmentId)) member.removeQuizAssignments.push(row.id as string);
      } else if (options.clearUntouched && !attemptedQuizzes.has(assessmentId)) {
        member.removeQuizAssignments.push(row.id as string);
      }
    }
    member.cases = member.cases.filter((c) => !member.keptCases.has(c.scenarioId));
    member.quizzes = member.quizzes.filter((q) => !member.keptQuizzes.has(q.assessmentId));
  }

  if (options.dryRun) {
    console.log('\nPlan, as of now. Nothing was written.\n');
    for (const m of members) {
      const count = <T extends string>(rows: { status: T }[]) =>
        Object.entries(rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}))
          .map(([status, n]) => `${n} ${status}`)
          .join(', ');
      console.log(
        `${m.profile.name.padEnd(26)} cases: ${count(m.cases)} | quizzes: ${count(m.quizzes)} | removes ${m.removeCases.length} case rows, ` +
          `${m.removeAttempts.length} attempts, ${m.removeQuizAssignments.length} quiz rows | keeps ${m.keptCases.size} cases, ${m.keptQuizzes.size} quizzes`,
      );
    }
    return;
  }

  // ---- Write ----------------------------------------------------------------
  interface Tally {
    quizzes: number[];
    cases: number[];
    late: number;
    handedIn: number;
    awaiting: number;
    overdue: number;
    reviews: number;
  }
  const tallies = new Map<string, Tally>();

  // Sections share no students and no rows, so they are built side by side.
  await Promise.all([...bySection.values()].map(async (sectionMembers) => {
    for (const member of sectionMembers) {
      const tally: Tally = { quizzes: [], cases: [], late: 0, handedIn: 0, awaiting: 0, overdue: 0, reviews: 0 };
      tallies.set(member.profile.name, tally);

      // ---- Clear ------------------------------------------------------------
      // Attempts cascade to answers, served questions and criteria scores; the
      // 027 trigger takes the derived competency scores.
      const removals: [string, string[]][] = [
        ['scenario_assignments', member.removeCases],
        ['assessment_attempts', member.removeAttempts],
        ['assessment_assignments', member.removeQuizAssignments],
      ];
      for (const [table, ids] of removals) {
        if (ids.length === 0) continue;
        const { error } = await supabase.from(table).delete().in('id', ids);
        if (error) throw new Error(`clear ${table} for ${member.profile.email}: ${error.message}`);
      }

      // ---- Cases and Return Demonstrations -----------------------------------
      for (const plan of member.cases) {
        const rng = seeded(hash(`${member.profile.email}|${plan.title}`));
        const handedIn = plan.handIn !== null;
        const graded = plan.gradedAt !== null;
        const seconds = handedIn ? Math.round(2700 * Math.exp(bell(rng) * 0.3)) : null;
        const { data: assignment, error: aErr } = await supabase
          .from('scenario_assignments')
          .insert({
            scenario_id: plan.scenarioId,
            student_id: member.studentId,
            team_id: member.teamId,
            assigned_by: options.instructorId,
            assigned_at: new Date(plan.assignedAt).toISOString(),
            deadline: new Date(plan.deadline).toISOString(),
            status: plan.status,
            required: true,
            started_at: handedIn ? new Date(plan.handIn! - seconds! * 1000).toISOString() : null,
            submitted_at: handedIn ? new Date(plan.handIn!).toISOString() : null,
            time_taken: seconds,
            completed_at: graded ? new Date(plan.gradedAt!).toISOString() : null,
            finalized_by: graded ? options.instructorId : null,
            score: graded ? 0 : null, // replaced below once tasks are known
          })
          .select('id')
          .single();
        if (aErr || !assignment) throw new Error(`${member.profile.email} / ${plan.title}: ${aErr?.message}`);

        if (handedIn) {
          tally.handedIn += 1;
          if (plan.handIn! > plan.deadline) tally.late += 1;
        }
        if (plan.status === 'in_progress') tally.awaiting += 1;
        if (plan.status === 'overdue') tally.overdue += 1;
        if (!graded) continue;

        const { data: tasks, error: tasksError } = await supabase
          .from('scenario_tasks')
          .select('id, points, skill_id, scenario_task_steps(id)')
          .eq('scenario_id', plan.scenarioId)
          .order('sort_order', { ascending: true });
        if (tasksError) throw new Error(`read tasks of ${plan.title}: ${tasksError.message}`);

        // Grade the way faculty do: each performed task has every sub-task
        // rated, and its completion row carries the level those add up to.
        const gradedAt = new Date(plan.gradedAt!).toISOString();
        const form = dayForm(rng);
        const done = (tasks ?? []).filter(() => rng() < member.profile.taskCompletion);
        const stepRatings: { assignment_id: string; step_id: string; rating: TaskRating; rated_by: string; rated_at: string }[] = [];
        const completions = done.map((t) => {
          const area = competencyName.get(chapterOfSkill.get(t.skill_id as string) ?? '') ?? '';
          const steps = (t.scenario_task_steps ?? []) as { id: string }[];
          let rating: TaskRating;
          if (steps.length > 0) {
            let credit = 0;
            for (const step of steps) {
              const level = drawLevel(stepChance(member.profile, area, step.id, plan.block, form), rng);
              credit += TASK_RATINGS.find((l) => l.key === level)!.credit;
              stepRatings.push({ assignment_id: assignment.id, step_id: step.id, rating: level, rated_by: options.instructorId, rated_at: gradedAt });
            }
            rating = ratingForCredit(credit / steps.length);
          } else {
            rating = drawLevel(stepChance(member.profile, area, t.id as string, plan.block, form), rng);
          }
          return {
            assignment_id: assignment.id,
            task_id: t.id,
            // Every task is rated in person by the faculty member; students
            // no longer chart on the ward, so nothing completes by itself.
            completed_by: options.instructorId,
            completed_via: 'faculty' as const,
            completed_at: new Date(plan.handIn!).toISOString(),
            rating,
            remarks: rng() < 0.4 ? REMARKS[rating][Math.floor(rng() * REMARKS[rating].length)] : null,
            rated_by: options.instructorId,
          };
        });
        if (completions.length > 0) {
          const { error } = await supabase.from('scenario_task_completions').insert(completions);
          if (error) throw new Error(`completions ${member.profile.email} / ${plan.title}: ${error.message}`);
        }
        if (stepRatings.length > 0) {
          const { error } = await supabase.from('scenario_task_step_ratings').insert(stepRatings);
          if (error) throw new Error(`step ratings ${member.profile.email} / ${plan.title}: ${error.message}`);
        }

        // The finalize route's own scoring, so the stored score is the one a
        // faculty member re-opening and saving this grade would get.
        const scored = await scoreAssignment(supabase, assignment.id, plan.scenarioId);
        if (scored.error) throw new Error(`scoring ${member.profile.email} / ${plan.title}: ${scored.error.message}`);
        const { error: scoreError } = await supabase.from('scenario_assignments').update({ score: scored.score }).eq('id', assignment.id);
        if (scoreError) throw new Error(`score ${member.profile.email} / ${plan.title}: ${scoreError.message}`);
        tally.cases.push(scored.score);
      }

      // ---- Quizzes ------------------------------------------------------------
      for (const plan of member.quizzes) {
        const { data: quizAssignment, error: qaErr } = await supabase
          .from('assessment_assignments')
          .insert({
            assessment_id: plan.assessmentId,
            student_id: member.studentId,
            assigned_by: options.instructorId,
            assigned_at: new Date(plan.assignedAt).toISOString(),
            deadline: new Date(plan.deadline).toISOString(),
            status: plan.status,
            required: true,
          })
          .select('id')
          .single();
        if (qaErr || !quizAssignment) throw new Error(`${member.profile.email} / ${plan.title}: ${qaErr?.message}`);
        if (plan.status === 'overdue') tally.overdue += 1;
        if (plan.sittings.length > 0) {
          tally.handedIn += 1;
          if (plan.sittings[0] > plan.deadline) tally.late += 1;
        }

        // In order, so the selector sees each sitting's earlier ones: past the
        // graded tries, a review of what this student still has wrong, and
        // nothing once that runs out.
        for (const [sitting, at] of plan.sittings.entries()) {
          const rng = seeded(hash(`${member.profile.email}|${plan.title}|${sitting}`));
          const review = sitting >= (limitOfAssessment.get(plan.assessmentId) ?? 1);
          let selection: SelectionResult;
          try {
            selection = await selectQuestionsForAttempt(supabase, {
              assessmentId: plan.assessmentId,
              studentId: member.studentId,
              practice: review,
              rng,
            });
          } catch (err) {
            if (review && err instanceof SelectionError) break;
            throw err;
          }

          const { data: attempt, error: atErr } = await supabase
            .from('assessment_attempts')
            .insert({
              assessment_id: plan.assessmentId,
              student_id: member.studentId,
              assignment_id: quizAssignment.id,
              status: 'in_progress',
              started_at: new Date(at).toISOString(),
            })
            .select('id')
            .single();
          if (atErr || !attempt) throw new Error(`${member.profile.email} / ${plan.title}: ${atErr?.message}`);

          const { error: servedError } = await supabase.from('attempt_questions').insert(
            selection.questions.map((q) => ({
              attempt_id: attempt.id,
              question_id: q.id,
              criteria_id: q.criteria_id,
              position: q.position,
            })),
          );
          if (servedError) throw new Error(`served questions ${member.profile.email}: ${servedError.message}`);

          const drawn = selection.questions.map((q) => {
            const question = questionById.get(q.id);
            const correctIndex = (question?.correct_index as number | undefined) ?? 0;
            const optionCount = Array.isArray(question?.options) ? question.options.length : 4;
            const p = answerChance(member.profile, areasOfQuestion.get(q.id) ?? [], { id: q.id, optionCount }, plan.block, review);
            const isCorrect = rng() < p;
            // Land on a wrong option rather than "no answer": an unanswered
            // question and a wrong one are different signals downstream.
            const selected = isCorrect ? correctIndex : (correctIndex + 1 + Math.floor(rng() * (optionCount - 1))) % optionCount;
            const seconds = 40 * Math.exp(difficulty(q.id) * 0.5 + bell(rng) * 0.45) * (isCorrect ? 1 : 1.25);
            return { questionId: q.id, selected, isCorrect, seconds };
          });
          // The app closes a timed paper at its limit.
          const limit = secondsOfAssessment.get(plan.assessmentId);
          const total = drawn.reduce((sum, d) => sum + d.seconds, 0);
          const pace = limit && total > limit * 0.97 ? (limit * 0.97) / total : 1;
          let elapsed = 0;
          const answers = drawn.map((d) => {
            const seconds = Math.max(5, Math.round(d.seconds * pace));
            elapsed += seconds;
            return {
              attempt_id: attempt.id,
              question_id: d.questionId,
              selected_index: d.selected,
              is_correct: d.isCorrect,
              time_spent_seconds: seconds,
              answered_at: new Date(at + elapsed * 1000).toISOString(),
            };
          });
          const { error: answersError } = await supabase.from('attempt_answers').insert(answers);
          if (answersError) throw new Error(`answers ${member.profile.email}: ${answersError.message}`);

          const correctByQuestion = new Map(answers.map((a) => [a.question_id, a.is_correct]));
          const correctCount = answers.filter((a) => a.is_correct).length;
          const score = Math.round((correctCount / answers.length) * 10000) / 100;

          // Same per-criterion arithmetic as the submit route, over the paper
          // this attempt was actually served.
          const { data: criteria } = await supabase
            .from('assessment_criteria')
            .select('id, name, weight, competency_id')
            .eq('assessment_id', plan.assessmentId)
            .order('sort_order', { ascending: true });
          const breakdown = (criteria ?? [])
            .map((c) => {
              const mine = selection.questions.filter((q) => q.criteria_id === c.id);
              const correct = mine.filter((q) => correctByQuestion.get(q.id)).length;
              const pct = mine.length > 0 ? Math.round((correct / mine.length) * 10000) / 100 : 0;
              return {
                attempt_id: attempt.id,
                criteria_id: c.id,
                competency_id: c.competency_id,
                criteria_name: c.name,
                weight: c.weight,
                correct,
                total: mine.length,
                score: pct,
                weighted_score: Math.round(pct * (Number(c.weight) / 100) * 100) / 100,
              };
            })
            .filter((b) => !review || b.total > 0);
          if (breakdown.length > 0) {
            const { error } = await supabase.from('attempt_criteria_scores').insert(breakdown);
            if (error) throw new Error(`criteria scores ${member.profile.email}: ${error.message}`);
          }

          // Exactly time_taken after the start: the stamp a re-run knows it by.
          const submittedAt = at + elapsed * 1000;
          const { error: submitError } = await supabase
            .from('assessment_attempts')
            .update({
              status: review ? 'practiced' : 'submitted',
              submitted_at: new Date(submittedAt).toISOString(),
              score,
              time_taken_seconds: elapsed,
            })
            .eq('id', attempt.id);
          if (submitError) throw new Error(`submit ${member.profile.email}: ${submitError.message}`);

          // A review grades nothing, and the warehouse doesn't date anything by it.
          if (review) {
            tally.reviews += 1;
            continue;
          }
          tally.quizzes.push(score);

          // The app's own roll-up, so competency standing matches what a real
          // submission would have produced, dated by the sitting.
          await deriveCompetencyScoresForAttempt(supabase, attempt.id);
          await supabase
            .from('competency_scores')
            .update({ created_at: new Date(submittedAt).toISOString() })
            .eq('attempt_id', attempt.id);
        }
      }
    }
  }));

  // ---- Report ---------------------------------------------------------------
  const mean = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
  const show = (x: number) => (Number.isNaN(x) ? '  - ' : x.toFixed(0).padStart(4));
  console.log(`\n${'Student'.padEnd(26)} Quiz Case Late Waiting Overdue Reviews`);
  const rows = [...tallies].sort(([, a], [, b]) => mean(b.cases) - mean(a.cases));
  for (const [name, t] of rows) {
    console.log(
      `${name.padEnd(26)} ${show(mean(t.quizzes))} ${show(mean(t.cases))} ${String(t.late).padStart(4)} ` +
        `${String(t.awaiting).padStart(7)} ${String(t.overdue).padStart(7)} ${String(t.reviews).padStart(7)}`,
    );
  }
  const all = [...tallies.values()];
  const caseMeans = all.map((t) => mean(t.cases)).filter((x) => !Number.isNaN(x));
  const handedIn = all.reduce((sum, t) => sum + t.handedIn, 0);
  console.log(
    `\nClass: quizzes ${mean(all.flatMap((t) => t.quizzes)).toFixed(1)}, cases ${mean(all.flatMap((t) => t.cases)).toFixed(1)}. ` +
      `${caseMeans.filter((x) => x < 75).length} of ${caseMeans.length} under 75 on cases. ` +
      `${all.reduce((sum, t) => sum + t.late, 0)} of ${handedIn} pieces of work late.`,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Found by the campus, so a Dean or instructor anywhere else can't be picked up.
  const { data: campus, error: campusError } = await supabase.from('campuses').select('id, name').eq('code', TEST_CAMPUS).maybeSingle();
  if (campusError || !campus) throw new Error(`No campus with code ${TEST_CAMPUS}: ${campusError?.message ?? 'not found'}`);
  const { data: deans, error: deanError } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'admin')
    .eq('campus_id', campus.id)
    .is('admin_title', null);
  if (deanError) throw new Error(`read test Dean: ${deanError.message}`);
  if (deans?.length !== 1) throw new Error(`Expected one Dean at ${campus.name}, found ${deans?.length ?? 0}.`);
  const { data: instructor, error: instructorError } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'faculty')
    .eq('admin_id', deans[0].id)
    .eq('name', TEST_INSTRUCTOR)
    .maybeSingle();
  if (instructorError || !instructor) throw new Error(`${TEST_INSTRUCTOR} isn't under ${deans[0].name}: ${instructorError?.message ?? 'not found'}`);

  console.log(`Target: ${new URL(url).hostname}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Under: ${deans[0].name} and ${instructor.name}, ${campus.name}`);
  await seedHistory(PROFILES, SECTION_WORK, {
    deanId: deans[0].id as string,
    instructorId: instructor.id as string,
    returnDemos: RETURN_DEMOS,
    clearUntouched: true,
    dryRun,
  });
}

// Run directly. seed-review-accounts.ts calls seedHistory for its own section.
if (process.argv[1]?.endsWith('seed-student-history.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
