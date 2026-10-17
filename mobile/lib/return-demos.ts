import type { ScenarioAssignment, ScenarioTask } from './api';

export type ReturnDemoStatus = { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger' };

/**
 * Where a Return Demonstration stands for the student: Graded once the
 * instructor finalizes it, Waiting for grade while some steps are rated,
 * Overdue past its deadline, otherwise Upcoming.
 */
export function returnDemoStatus(
  assignment: Pick<ScenarioAssignment, 'status' | 'deadline' | 'score'>,
  tasks: Pick<ScenarioTask, 'rating'>[] = [],
  now = Date.now(),
): ReturnDemoStatus {
  if (assignment.status === 'completed') {
    return { label: assignment.score != null ? `Graded · ${assignment.score}%` : 'Graded', variant: 'success' };
  }
  if (tasks.some((t) => t.rating)) return { label: 'Waiting for grade', variant: 'info' };
  if (assignment.status === 'overdue' || (assignment.deadline && Date.parse(assignment.deadline) < now)) {
    return { label: 'Overdue', variant: 'danger' };
  }
  return { label: 'Upcoming', variant: 'warning' };
}
