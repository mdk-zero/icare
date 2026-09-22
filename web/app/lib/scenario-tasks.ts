import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gradedScore,
  isTaskRating,
  ratingForCredit,
  taskCredit,
  type StepGrades,
  type TaskRating,
} from '@/app/lib/task-ratings';

export type ScenarioTaskTrigger = 'vitals' | 'charting';

export interface TaskCompletionRow {
  assignment_id: string;
  task_id: string;
  completed_via: 'system' | 'faculty';
  completed_at: string;
  rating: TaskRating | null;
  remarks: string | null;
}

/**
 * Before migration 043 the rating columns don't exist. PostgREST reports an
 * unknown column on select as 42703 and on write as PGRST204.
 */
export function isMissingRatingColumns(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

export const RATINGS_NEED_MIGRATION =
  'Verbal ratings need database migration 043 (scenario task ratings) applied first.';

const BASE_COLUMNS = 'assignment_id, task_id, completed_via, completed_at';

/**
 * Completion rows for the given assignments, with their ratings when the
 * database has them. `ratingsEnabled` is false before migration 043, when every
 * row reads back unrated — which scores exactly as check-offs always did.
 */
export async function fetchTaskCompletions(
  supabase: SupabaseClient,
  assignmentIds: string[],
): Promise<{
  rows: TaskCompletionRow[];
  ratingsEnabled: boolean;
  error: { message?: string } | null;
}> {
  if (assignmentIds.length === 0) return { rows: [], ratingsEnabled: true, error: null };

  const rated = await supabase
    .from('scenario_task_completions')
    .select(`${BASE_COLUMNS}, rating, remarks`)
    .in('assignment_id', assignmentIds);
  if (!rated.error) {
    const rows = (rated.data ?? []).map((row) => ({
      ...(row as Omit<TaskCompletionRow, 'rating'> & { rating: unknown }),
      rating: isTaskRating(row.rating) ? row.rating : null,
    }));
    return { rows, ratingsEnabled: true, error: null };
  }
  if (!isMissingRatingColumns(rated.error)) {
    return { rows: [], ratingsEnabled: true, error: rated.error };
  }

  const legacy = await supabase
    .from('scenario_task_completions')
    .select(BASE_COLUMNS)
    .in('assignment_id', assignmentIds);
  const rows = (legacy.data ?? []).map((row) => ({
    ...(row as Omit<TaskCompletionRow, 'rating' | 'remarks'>),
    rating: null,
    remarks: null,
  }));
  return { rows, ratingsEnabled: false, error: legacy.error };
}

export interface TaskStepRow {
  id: string;
  task_id: string;
  title: string;
  source: string;
  sort_order: number;
}

export interface StepRatingRow {
  assignment_id: string;
  step_id: string;
  rating: TaskRating;
}

/**
 * Before migration 044 the sub-task tables don't exist. Postgres reports an
 * unknown table as 42P01; PostgREST, whose schema cache has never seen it, as
 * PGRST205.
 */
export function isMissingStepTables(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export const STEPS_NEED_MIGRATION =
  'Sub-task checklists need database migration 044 (scenario task steps) applied first.';

/**
 * The sub-tasks of the given tasks, in checklist order. `stepsEnabled` is
 * false before migration 044, when every task reads as having none and is
 * graded as a whole, as it always was.
 */
export async function fetchTaskSteps(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<{ steps: TaskStepRow[]; stepsEnabled: boolean; error: { message?: string } | null }> {
  if (taskIds.length === 0) return { steps: [], stepsEnabled: true, error: null };
  const { data, error } = await supabase
    .from('scenario_task_steps')
    .select('id, task_id, title, source, sort_order')
    .in('task_id', taskIds)
    .order('sort_order', { ascending: true });
  if (error) {
    if (isMissingStepTables(error)) return { steps: [], stepsEnabled: false, error: null };
    return { steps: [], stepsEnabled: true, error };
  }
  return { steps: (data ?? []) as TaskStepRow[], stepsEnabled: true, error: null };
}

/** Sub-task ratings for the given assignments; none before migration 044. */
export async function fetchStepRatings(
  supabase: SupabaseClient,
  assignmentIds: string[],
): Promise<{ rows: StepRatingRow[]; error: { message?: string } | null }> {
  if (assignmentIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase
    .from('scenario_task_step_ratings')
    .select('assignment_id, step_id, rating')
    .in('assignment_id', assignmentIds);
  if (error) {
    if (isMissingStepTables(error)) return { rows: [], error: null };
    return { rows: [], error };
  }
  const rows = (data ?? []).filter((row): row is StepRatingRow => isTaskRating(row.rating));
  return { rows, error: null };
}

/** Each task's sub-task count and the ratings one assignment gave them. */
export function stepGradesByTask(
  steps: readonly TaskStepRow[],
  ratings: readonly StepRatingRow[],
): Map<string, StepGrades> {
  const ratingByStep = new Map(ratings.map((r) => [r.step_id, r.rating]));
  const byTask = new Map<string, { total: number; ratings: TaskRating[] }>();
  for (const step of steps) {
    const entry = byTask.get(step.task_id) ?? { total: 0, ratings: [] };
    entry.total += 1;
    const rating = ratingByStep.get(step.id);
    if (rating) entry.ratings.push(rating);
    byTask.set(step.task_id, entry);
  }
  return byTask;
}

/**
 * Everything that decides one assignment's grade, and the grade itself: each
 * task's points scaled by its rating, or by its sub-tasks' ratings once any
 * are rated. Shared by finalize and by edits to a finalized grade.
 */
export async function scoreAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  scenarioId: string,
): Promise<
  | {
      score: number;
      completions: TaskCompletionRow[];
      stepsByTask: Map<string, StepGrades>;
      error: null;
    }
  | { error: { message?: string } }
> {
  const { data: tasks, error: tasksError } = await supabase
    .from('scenario_tasks')
    .select('id, points')
    .eq('scenario_id', scenarioId);
  if (tasksError) return { error: tasksError };

  const [completions, steps, stepRatings] = await Promise.all([
    fetchTaskCompletions(supabase, [assignmentId]),
    fetchTaskSteps(supabase, (tasks ?? []).map((t) => t.id as string)),
    fetchStepRatings(supabase, [assignmentId]),
  ]);
  const error = completions.error ?? steps.error ?? stepRatings.error;
  if (error) return { error };

  const stepsByTask = stepGradesByTask(steps.steps, stepRatings.rows);
  const score = gradedScore(
    tasks ?? [],
    new Map(completions.rows.map((c) => [c.task_id, c])),
    stepsByTask,
  );
  return { score, completions: completions.rows, stepsByTask, error: null };
}

/**
 * Bring each sub-task-graded task's overall level, kept on its completion row
 * for the readers that know only tasks, in line with its sub-tasks. Two
 * ratings saved at the same moment can each write the level from the other's
 * half-finished state, and a failed write can leave rated sub-tasks with no
 * completion row at all; running this at finalize settles both before
 * students see the grade.
 */
export async function syncStepGradedLevels(
  supabase: SupabaseClient,
  assignmentId: string,
  completions: readonly TaskCompletionRow[],
  stepsByTask: ReadonlyMap<string, StepGrades>,
  ratedBy: string,
): Promise<void> {
  const completionByTask = new Map(completions.map((c) => [c.task_id, c]));
  const writes: PromiseLike<{ error: { message?: string } | null }>[] = [];
  for (const [taskId, steps] of stepsByTask) {
    if (steps.ratings.length === 0) continue;
    const completion = completionByTask.get(taskId);
    const level = ratingForCredit(taskCredit(completion, steps));
    if (!completion) {
      writes.push(
        supabase.from('scenario_task_completions').insert({
          assignment_id: assignmentId,
          task_id: taskId,
          completed_by: ratedBy,
          completed_via: 'faculty',
          rating: level,
          rated_by: ratedBy,
        }),
      );
    } else if (completion.rating !== level) {
      writes.push(
        supabase
          .from('scenario_task_completions')
          .update({ rating: level })
          .eq('assignment_id', assignmentId)
          .eq('task_id', taskId),
      );
    }
  }
  for (const { error } of await Promise.all(writes)) {
    if (error) console.error('Failed to sync a sub-task-graded task level', error);
  }
}

/**
 * Auto-check the student's system-verified scenario tasks when they perform the
 * matching in-app action (recording vitals, or charting a TPR/IVF/note for the
 * scenario's patient). Fire-and-forget: it must never fail the originating
 * clinical write, so all errors are swallowed after logging.
 */
export async function autoCompleteScenarioTasks(
  supabase: SupabaseClient,
  studentId: string,
  patientId: string,
  trigger: ScenarioTaskTrigger,
): Promise<void> {
  try {
    const { data: scenarios } = await supabase
      .from('scenarios')
      .select('id')
      .eq('patient_id', patientId);
    if (!scenarios || scenarios.length === 0) return;
    const scenarioIds = scenarios.map((s) => s.id as string);

    // The student's not-yet-finalized assignments for those scenarios.
    const { data: assignments } = await supabase
      .from('scenario_assignments')
      .select('id, scenario_id')
      .eq('student_id', studentId)
      .in('scenario_id', scenarioIds)
      .neq('status', 'completed');
    if (!assignments || assignments.length === 0) return;

    // System tasks on those scenarios that this action satisfies.
    const { data: tasks } = await supabase
      .from('scenario_tasks')
      .select('id, scenario_id')
      .in('scenario_id', scenarioIds)
      .eq('verification', 'system')
      .eq('system_trigger', trigger);
    if (!tasks || tasks.length === 0) return;

    const taskIdsByScenario = new Map<string, string[]>();
    for (const t of tasks) {
      const list = taskIdsByScenario.get(t.scenario_id as string) ?? [];
      list.push(t.id as string);
      taskIdsByScenario.set(t.scenario_id as string, list);
    }

    const rows: {
      assignment_id: string;
      task_id: string;
      completed_by: string;
      completed_via: 'system';
    }[] = [];
    for (const a of assignments) {
      for (const taskId of taskIdsByScenario.get(a.scenario_id as string) ?? []) {
        rows.push({
          assignment_id: a.id as string,
          task_id: taskId,
          completed_by: studentId,
          completed_via: 'system',
        });
      }
    }
    if (rows.length === 0) return;

    // A pre-existing (assignment_id, task_id) row already means "done".
    await supabase
      .from('scenario_task_completions')
      .upsert(rows, { onConflict: 'assignment_id,task_id', ignoreDuplicates: true });
  } catch (err) {
    console.error('autoCompleteScenarioTasks failed', err);
  }
}
