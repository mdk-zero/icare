/**
 * The scale faculty grade each scenario task (criterion) on: the three columns
 * of the Taylor's skill checklists — Excellent, Satisfactory, Needs Practice.
 * Shared by the review page and the finalize route, so the score a faculty
 * member sees projected is the score that gets locked in.
 *
 * A task with a sub-task checklist is rated one sub-task at a time, each level
 * worth `points` out of MAX_RATING_POINTS; a task without one is rated as a
 * whole. Either way `credit` is the share of the task's points it earns: the
 * task's points stay its weight in the scenario, and faculty never type a
 * number.
 */
export type TaskRating = 'excellent' | 'satisfactory' | 'needs_practice';

export interface TaskRatingLevel {
  key: TaskRating;
  label: string;
  /** The book's definition of the column, the default rubric for the level. */
  rubric: string;
  /** What a checkmark in this column scores, out of MAX_RATING_POINTS. */
  points: number;
  credit: number;
}

export const MAX_RATING_POINTS = 10;

const level = (key: TaskRating, label: string, points: number, rubric: string): TaskRatingLevel => ({
  key,
  label,
  rubric,
  points,
  credit: points / MAX_RATING_POINTS,
});

/**
 * Best first. The rubrics are the book's own legend ("Checkmark in the
 * Excellent column denotes mastering the procedure", ...). A step nobody
 * rated earns nothing.
 */
export const TASK_RATINGS: readonly TaskRatingLevel[] = [
  level('excellent', 'Excellent', 10, 'Mastered the procedure: every step performed correctly, confidently, and without prompting.'),
  level('satisfactory', 'Satisfactory', 7.5, 'Used the recommended technique for each step, with minor hesitation or prompting.'),
  level('needs_practice', 'Needs Practice', 5, 'Used some but not all of the recommended technique; the step needs further practice.'),
];

/** A rubric: what each level means, for one scenario or the book's defaults. */
export type Rubric = Record<TaskRating, string>;

export const DEFAULT_RUBRIC: Rubric = Object.fromEntries(TASK_RATINGS.map((l) => [l.key, l.rubric])) as Rubric;

export const MAX_RUBRIC_LENGTH = 500;

/**
 * A scenario's rubric: its own wording where faculty wrote some, the book's
 * default for any level left blank. Accepts whatever the column holds.
 */
export function resolveRubric(stored: unknown): Rubric {
  const out = { ...DEFAULT_RUBRIC };
  if (stored && typeof stored === 'object') {
    for (const l of TASK_RATINGS) {
      const v = (stored as Record<string, unknown>)[l.key];
      if (typeof v === 'string' && v.trim()) out[l.key] = v.trim().slice(0, MAX_RUBRIC_LENGTH);
    }
  }
  return out;
}

const LEVEL_BY_KEY = new Map(TASK_RATINGS.map((l) => [l.key, l]));

export const MAX_REMARKS_LENGTH = 1000;

export function isTaskRating(value: unknown): value is TaskRating {
  return typeof value === 'string' && LEVEL_BY_KEY.has(value as TaskRating);
}

/**
 * The six-level scale before migration 046, read as today's three. Stored
 * "not performed" meant the step or task wasn't done: it reads as absent.
 */
const LEGACY_RATINGS: Record<string, TaskRating | 'absent'> = {
  very_good: 'satisfactory',
  good: 'satisfactory',
  fair: 'needs_practice',
  needs_improvement: 'needs_practice',
  not_performed: 'absent',
};

/**
 * A rating column's value as a level; null for an unrated row, 'absent' for a
 * row that means nothing was performed (a pre-046 "not performed", which 046
 * deletes). Lets the app read the database correctly before 046 is applied.
 */
export function storedRating(value: unknown): TaskRating | null | 'absent' {
  if (isTaskRating(value)) return value;
  if (typeof value === 'string' && value in LEGACY_RATINGS) return LEGACY_RATINGS[value];
  return null;
}

export function ratingLabel(rating: TaskRating): string {
  return LEVEL_BY_KEY.get(rating)?.label ?? rating;
}

export function ratingPoints(rating: TaskRating): number {
  return LEVEL_BY_KEY.get(rating)?.points ?? 0;
}

/** The part of a completion row that decides its credit. */
export interface GradedCompletion {
  rating: TaskRating | null;
}

/**
 * Credit for one task. No completion row earns nothing; a row without a
 * rating is a pre-rating check-off or an auto-completed task faculty have not
 * rated, and keeps the full credit it always had.
 */
export function completionCredit(completion: GradedCompletion | undefined): number {
  if (!completion) return 0;
  if (completion.rating === null) return 1;
  return LEVEL_BY_KEY.get(completion.rating)?.credit ?? 0;
}

/**
 * Whether a completion row means the task was done. Every level on the scale
 * is a performance, so any row is — except a "not performed" left from before
 * migration 046, which was a row too. Takes raw rows as well as parsed ones.
 */
export function isPerformed(completion: { rating?: unknown } | undefined): boolean {
  return Boolean(completion) && storedRating(completion!.rating) !== 'absent';
}

/** How one assignment rated a task's sub-tasks. */
export interface StepGrades {
  /** How many sub-tasks the task has. */
  total: number;
  /** The levels of the sub-tasks that are rated; the rest earn nothing. */
  ratings: readonly TaskRating[];
}

/**
 * Credit for one task. Once any of its sub-tasks is rated, the task earns the
 * average of its sub-tasks' credit, an unrated one counting as zero. Until
 * then it scores as a whole, from its completion row.
 */
export function taskCredit(completion: GradedCompletion | undefined, steps?: StepGrades): number {
  if (steps && steps.total > 0 && steps.ratings.length > 0) {
    let earned = 0;
    for (const rating of steps.ratings) earned += LEVEL_BY_KEY.get(rating)?.credit ?? 0;
    return Math.min(1, earned / steps.total);
  }
  return completionCredit(completion);
}

/** Weighted 0–100 score across a scenario's tasks. */
export function gradedScore(
  tasks: readonly { id: string; points: number | null }[],
  completionByTask: ReadonlyMap<string, GradedCompletion>,
  stepsByTask?: ReadonlyMap<string, StepGrades>,
): number {
  let total = 0;
  let earned = 0;
  for (const task of tasks) {
    const points = task.points ?? 0;
    total += points;
    earned += points * taskCredit(completionByTask.get(task.id), stepsByTask?.get(task.id));
  }
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

/** Each band starts halfway between two levels' credits (100 / 75 / 50). */
const EXCELLENT_MIN = 88;
const SATISFACTORY_MIN = 63;

/**
 * The single level that sums up a task graded sub-task by sub-task — what the
 * student sees on the task. Same bands as scoreDescriptor. Only asked of a
 * task with at least one rated sub-task.
 */
export function ratingForCredit(credit: number): TaskRating {
  const score = Math.round(credit * 100);
  if (score >= EXCELLENT_MIN) return 'excellent';
  if (score >= SATISFACTORY_MIN) return 'satisfactory';
  return 'needs_practice';
}


/**
 * The sub-task ratings a task ends up with after `changes` (step id → level,
 * or null to clear). A task that was graded as a whole — an auto-completion
 * or an earlier whole-task rating — shows that level on every sub-task until
 * one is rated; the first rating writes the rest down at that level, so the
 * checklist keeps reading what it showed a moment before. Returns every
 * sub-task's level in `stepIds` order.
 */
export function resolveStepRatings(
  stepIds: readonly string[],
  current: ReadonlyMap<string, TaskRating>,
  wholeTaskLevel: TaskRating | null,
  changes: ReadonlyMap<string, TaskRating | null>,
): (TaskRating | null)[] {
  const implied = current.size === 0 ? wholeTaskLevel : null;
  return stepIds.map((id) => {
    if (changes.has(id)) return changes.get(id) ?? null;
    return current.get(id) ?? implied;
  });
}

/**
 * The level a task without sub-task ratings is graded at as a whole: its
 * rating, or full credit for a completion nobody rated. Null when there is no
 * completion, which earns nothing.
 */
export function wholeTaskLevel(completion: GradedCompletion | undefined): TaskRating | null {
  if (!completion) return null;
  return completion.rating ?? 'excellent';
}

/**
 * The verbal reading of an overall score, on the same bands as the levels, so
 * a scenario rated "Satisfactory" throughout reads "Satisfactory".
 */
export function scoreDescriptor(score: number): string {
  return ratingLabel(ratingForCredit(score / 100));
}
