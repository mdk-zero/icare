/**
 * The verbal scale faculty grade each scenario task (criterion) on. Shared by
 * the review page and the finalize route, so the score a faculty member sees
 * projected is the score that gets locked in.
 *
 * `credit` is the share of the task's points the rating earns. The task's
 * points stay as its weight in the scenario; faculty never type a number.
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
  credit: number;
}

/** Best first. */
export const TASK_RATINGS: readonly TaskRatingLevel[] = [
  { key: 'excellent', label: 'Excellent', credit: 1 },
  { key: 'very_good', label: 'Very Good', credit: 0.9 },
  { key: 'good', label: 'Good', credit: 0.8 },
  { key: 'fair', label: 'Fair', credit: 0.7 },
  { key: 'needs_improvement', label: 'Needs Improvement', credit: 0.5 },
  { key: 'not_performed', label: 'Not Performed', credit: 0 },
];

const LEVEL_BY_KEY = new Map(TASK_RATINGS.map((level) => [level.key, level]));

export const MAX_REMARKS_LENGTH = 1000;

export function isTaskRating(value: unknown): value is TaskRating {
  return typeof value === 'string' && LEVEL_BY_KEY.has(value as TaskRating);
}

export function ratingLabel(rating: TaskRating): string {
  return LEVEL_BY_KEY.get(rating)?.label ?? rating;
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

/** Weighted 0–100 score across a scenario's tasks. */
export function gradedScore(
  tasks: readonly { id: string; points: number | null }[],
  completionByTask: ReadonlyMap<string, GradedCompletion>,
): number {
  let total = 0;
  let earned = 0;
  for (const task of tasks) {
    const points = task.points ?? 0;
    total += points;
    earned += points * completionCredit(completionByTask.get(task.id));
  }
  return total > 0 ? Math.round((earned / total) * 100) : 0;
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
