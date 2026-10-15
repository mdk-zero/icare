/**
 * The scale faculty grade scenario tasks on — the Taylor's checklist columns.
 * Mirrors web/app/lib/task-ratings.ts, which owns the scoring; the app only
 * displays what the server sends once a scenario is finalized.
 */
export type TaskRating = 'excellent' | 'satisfactory' | 'needs_practice';

/**
 * A scenario task can also be marked N/A — a Taylor's step not done in
 * Philippine practice — which leaves it out of the score. Case presentations
 * use the three levels alone.
 */
export type ChecklistRating = TaskRating | 'not_applicable';

export const TASK_RATING_LABEL: Record<ChecklistRating, string> = {
  excellent: 'Excellent',
  satisfactory: 'Satisfactory',
  needs_practice: 'Needs Practice',
  not_applicable: 'N/A',
};

export const TASK_RATING_BADGE: Record<ChecklistRating, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  excellent: 'success',
  satisfactory: 'info',
  needs_practice: 'warning',
  not_applicable: 'default',
};

/** The verbal reading of a 0–100 scenario score, on the web's bands. */
export function scoreDescriptor(score: number): string {
  if (score >= 83) return 'Excellent';
  if (score >= 50) return 'Satisfactory';
  return 'Needs Practice';
}
