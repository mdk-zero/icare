/**
 * The scale faculty grade scenario tasks on — the Taylor's checklist columns.
 * Mirrors web/app/lib/task-ratings.ts, which owns the scoring; the app only
 * displays what the server sends once a scenario is finalized.
 */
export type TaskRating = 'excellent' | 'satisfactory' | 'needs_practice';

export const TASK_RATING_LABEL: Record<TaskRating, string> = {
  excellent: 'Excellent',
  satisfactory: 'Satisfactory',
  needs_practice: 'Needs Practice',
};

export const TASK_RATING_BADGE: Record<TaskRating, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  excellent: 'success',
  satisfactory: 'info',
  needs_practice: 'warning',
};

/** The verbal reading of a 0–100 scenario score, on the web's bands. */
export function scoreDescriptor(score: number): string {
  if (score >= 88) return 'Excellent';
  if (score >= 63) return 'Satisfactory';
  return 'Needs Practice';
}
