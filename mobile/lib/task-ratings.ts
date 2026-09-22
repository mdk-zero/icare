/**
 * The verbal scale faculty grade scenario tasks on. Mirrors
 * web/app/lib/task-ratings.ts, which owns the scoring; the app only displays
 * what the server sends once a scenario is finalized.
 */
export type TaskRating =
  | 'excellent'
  | 'very_good'
  | 'good'
  | 'fair'
  | 'needs_improvement'
  | 'not_performed';

export const TASK_RATING_LABEL: Record<TaskRating, string> = {
  excellent: 'Excellent',
  very_good: 'Very Good',
  good: 'Good',
  fair: 'Fair',
  needs_improvement: 'Needs Improvement',
  not_performed: 'Not Performed',
};

export const TASK_RATING_BADGE: Record<TaskRating, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  excellent: 'success',
  very_good: 'success',
  good: 'info',
  fair: 'warning',
  needs_improvement: 'danger',
  not_performed: 'default',
};

/** The verbal reading of a 0–100 scenario score. */
export function scoreDescriptor(score: number): string {
  if (score >= 95) return 'Excellent';
  if (score >= 85) return 'Very Good';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Improvement';
}
