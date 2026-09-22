/**
 * The verbal scale faculty grade each scenario task (criterion) on. Shared by
 * the review page and the finalize route, so the score a faculty member sees
 * projected is the score that gets locked in.
 *
 * A task with a sub-task checklist is rated one sub-task at a time, each level
 * worth `points` out of MAX_RATING_POINTS; a task without one is rated as a
 * whole. Either way `credit` is the share of the task's points it earns: the
 * task's points stay its weight in the scenario, and faculty never type a
 * number.
 */
export type TaskRating =
  | 'excellent'
  | 'very_good'
  | 'good'
  | 'fair'
  | 'needs_improvement'
  | 'not_performed';

export interface TaskRatingLevel {
  key: TaskRating;
  label: string;
  /** What a checkmark in this column scores, out of MAX_RATING_POINTS. */
  points: number;
  credit: number;
}

export const MAX_RATING_POINTS = 10;

const level = (key: TaskRating, label: string, points: number): TaskRatingLevel => ({
  key,
  label,
  points,
  credit: points / MAX_RATING_POINTS,
});

/** Best first. */
export const TASK_RATINGS: readonly TaskRatingLevel[] = [
  level('excellent', 'Excellent', 10),
  level('very_good', 'Very Good', 9),
  level('good', 'Good', 8),
  level('fair', 'Fair', 7),
  level('needs_improvement', 'Needs Improvement', 5),
  level('not_performed', 'Not Performed', 0),
];

const LEVEL_BY_KEY = new Map(TASK_RATINGS.map((l) => [l.key, l]));

export const MAX_REMARKS_LENGTH = 1000;

export function isTaskRating(value: unknown): value is TaskRating {
  return typeof value === 'string' && LEVEL_BY_KEY.has(value as TaskRating);
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

/** Whether a completion row means the task was done — "not performed" is a row too. */
export function isPerformed(completion: GradedCompletion | undefined): boolean {
  return Boolean(completion) && completion!.rating !== 'not_performed';
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

/**
 * The single level that sums up a task graded sub-task by sub-task — what the
 * student sees on the task and what "performed" is judged by. Same bands as
 * scoreDescriptor, except that nothing earned reads Not Performed.
 */
export function ratingForCredit(credit: number): TaskRating {
  if (credit <= 0) return 'not_performed';
  const score = Math.round(credit * 100);
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'very_good';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'needs_improvement';
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
 * completion, which scores as Not Performed.
 */
export function wholeTaskLevel(completion: GradedCompletion | undefined): TaskRating | null {
  if (!completion) return null;
  return completion.rating ?? 'excellent';
}

/**
 * The verbal reading of an overall score. Each band starts halfway between
 * two ratings' credits, so a scenario rated "Good" throughout reads "Good".
 */
export function scoreDescriptor(score: number): string {
  if (score >= 95) return 'Excellent';
  if (score >= 85) return 'Very Good';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Improvement';
}
