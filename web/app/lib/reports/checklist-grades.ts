import {
  isChecklistRating,
  isPerformed,
  resolveStepRatings,
  storedRating,
  taskCredit,
  taskLevelForCredit,
  wholeTaskLevel,
  type ChecklistRating,
} from '../task-ratings';
import { skillPoints, type SheetSkill } from './checklist-sheet';

/**
 * Lays a Return Demonstration's checklist out against the assignments given,
 * one grade column each, in the order given. Pure, so the server's report and
 * the demo's read the same rules: a skill graded as a whole shows that level
 * on each of its steps, as the grading sheet does, and a step nobody rated
 * reads null.
 */
export function buildSheetSkills(input: {
  /** In checklist order. */
  tasks: readonly { id: string; title: string }[];
  /** In checklist order within each task. */
  steps: readonly { id: string; task_id: string; title: string; source?: string | null }[];
  assignmentIds: readonly string[];
  completions: readonly { assignment_id: string; task_id: string; rating: unknown }[];
  stepRatings: readonly { assignment_id: string; step_id: string; rating: unknown }[];
}): SheetSkill[] {
  const completionOf = new Map(input.completions.map((c) => [`${c.assignment_id}:${c.task_id}`, c]));
  const ratingOf = new Map<string, Map<string, ChecklistRating>>();
  for (const r of input.stepRatings) {
    const level = storedRating(r.rating);
    if (level === null || level === 'absent') continue;
    const byStep = ratingOf.get(r.assignment_id) ?? new Map<string, ChecklistRating>();
    byStep.set(r.step_id, level);
    ratingOf.set(r.assignment_id, byStep);
  }

  return input.tasks.map((task) => {
    const taskSteps = input.steps.filter((s) => s.task_id === task.id);
    const stepIds = taskSteps.map((s) => s.id);
    const columns = input.assignmentIds.map((assignmentId) => {
      const row = completionOf.get(`${assignmentId}:${task.id}`);
      const rating = row ? storedRating(row.rating) : null;
      const completion =
        row && isPerformed(row)
          ? { rating: rating !== 'absent' && isChecklistRating(rating) ? rating : null }
          : undefined;
      const current = new Map(
        stepIds.flatMap((id) => {
          const level = ratingOf.get(assignmentId)?.get(id);
          return level ? ([[id, level]] as const) : [];
        }),
      );
      const grades = resolveStepRatings(stepIds, current, wholeTaskLevel(completion), new Map());
      const graded = completion !== undefined || current.size > 0;
      const level = graded
        ? taskLevelForCredit(taskCredit(completion, { total: stepIds.length, ratings: [...current.values()] }))
        : null;
      // A skill with no steps is one row, graded as a whole.
      const rows = stepIds.length > 0 ? grades : [level];
      return { grades, level, points: graded ? skillPoints(rows) : null };
    });
    return {
      title: task.title,
      levels: columns.map((c) => c.level),
      points: columns.map((c) => c.points),
      steps: taskSteps.map((step, i) => ({
        title: step.title,
        source: step.source ?? '',
        grades: columns.map((c) => c.grades[i] ?? null),
      })),
    };
  });
}
