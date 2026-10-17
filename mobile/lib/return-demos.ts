import type { ScenarioAssignment, ScenarioTask } from './api';

/**
 * What a finished patient case or Return Demonstration reads as, everywhere
 * on the phone: "Graded · 85%", or "Graded" before its score is in.
 */
export const gradedLabel = (score: number | null | undefined) => (score != null ? `Graded · ${score}%` : 'Graded');

/**
 * A patient case or Return Demonstration is performed on its date; it is not
 * a deadline (only quizzes have those). "Perform on Mon, Oct 20".
 */
export const performOn = (iso: string | null | undefined) =>
  iso
    ? `Perform on ${new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
    : 'No date set';

export type ReturnDemoStatus = { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger' };

/**
 * Where a Return Demonstration stands for the student. Its date is the day
 * they perform it, not a deadline, so it is never Overdue: Graded once the
 * instructor finalizes it, Waiting for grade while some steps are rated,
 * Today on the day, otherwise Scheduled.
 */
export function returnDemoStatus(
  assignment: Pick<ScenarioAssignment, 'status' | 'deadline' | 'score'>,
  tasks: Pick<ScenarioTask, 'rating'>[] = [],
  now = Date.now(),
): ReturnDemoStatus {
  if (assignment.status === 'completed') {
    return { label: gradedLabel(assignment.score), variant: 'success' };
  }
  if (tasks.some((t) => t.rating)) return { label: 'Waiting for grade', variant: 'info' };
  if (assignment.deadline && new Date(assignment.deadline).toDateString() === new Date(now).toDateString()) {
    return { label: 'Today', variant: 'warning' };
  }
  return { label: 'Scheduled', variant: 'default' };
}
