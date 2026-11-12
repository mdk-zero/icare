import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { buildSheetSkills } from './checklist-grades';
import { loadGroupings } from './groupings';
import { scenarioKinds, type ScenarioKind } from '../scenario-kind';
import type { SheetSkill } from './checklist-sheet';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface Performer {
  assignmentId: string;
  studentId: string;
  name: string;
  teamId: string | null;
  /** "BSN 1101 · Group A", or the section alone for a student in no group. */
  groupLabel: string;
  status: string;
  score: number | null;
  deadline: string | null;
  completedAt: string | null;
}

export interface ChecklistRoster {
  title: string;
  performers: Performer[];
}

/**
 * The students a Return Demonstration was given to, within the viewer's
 * scope (null for no limit), each with the group they are in now. Null when
 * the scenario isn't a Return Demonstration.
 */
export async function loadChecklistRoster(
  supabase: Supabase,
  kind: ScenarioKind,
  scenarioId: string,
  scope: readonly string[] | null,
): Promise<ChecklistRoster | null> {
  const { data: scenario } = await supabase.from('scenarios').select('id, title').eq('id', scenarioId).maybeSingle();
  if (!scenario || (await scenarioKinds(supabase, [scenarioId])).get(scenarioId) !== kind) return null;

  const { data: assignments, error } = await supabase
    .from('scenario_assignments')
    .select('id, student_id, status, score, deadline, completed_at, users!scenario_assignments_student_id_fkey(name, section_id)')
    .eq('scenario_id', scenarioId);
  if (error) throw new Error(`Unable to read the assignments: ${error.message}`);

  type Row = {
    id: string;
    student_id: string;
    status: string;
    score: number | string | null;
    deadline: string | null;
    completed_at: string | null;
    users: { name: string | null; section_id: string | null } | null;
  };
  const rows = ((assignments ?? []) as unknown as Row[]).filter((a) => !scope || scope.includes(a.student_id));
  const groupings = await loadGroupings(
    supabase,
    rows.map((a) => ({ id: a.student_id, section_id: a.users?.section_id ?? null })),
  );

  const performers = rows
    .map((a): Performer => {
      const g = groupings.get(a.student_id);
      return {
        assignmentId: a.id,
        studentId: a.student_id,
        name: a.users?.name ?? 'Unknown student',
        teamId: g?.teamId ?? null,
        groupLabel: g?.groupLabel ?? 'No group',
        status: a.status,
        score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
        deadline: a.deadline,
        completedAt: a.completed_at,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { title: scenario.title as string, performers };
}

/**
 * The checklist of a Return Demonstration with what each given assignment was
 * graded on every step, one grade column per assignment in the order given.
 * A skill graded as a whole shows that level on each of its steps, as the
 * grading sheet does; a step nobody rated reads null.
 */
export async function loadSheetSkills(
  supabase: Supabase,
  scenarioId: string,
  assignmentIds: readonly string[],
): Promise<SheetSkill[]> {
  const { data: tasks, error } = await supabase
    .from('scenario_tasks')
    .select('id, title, sort_order')
    .eq('scenario_id', scenarioId)
    .order('sort_order');
  if (error) throw new Error(`Unable to read the skills: ${error.message}`);
  const taskRows = (tasks ?? []) as { id: string; title: string }[];
  if (taskRows.length === 0) return [];
  const taskIds = taskRows.map((t) => t.id);

  const { data: steps, error: stepsError } = await supabase
    .from('scenario_task_steps')
    .select('id, task_id, title, source, sort_order')
    .in('task_id', taskIds)
    .order('sort_order');
  if (stepsError) throw new Error(`Unable to read the checklist: ${stepsError.message}`);
  const stepRows = (steps ?? []) as { id: string; task_id: string; title: string; source: string | null }[];

  const ids = [...assignmentIds];
  const [completions, stepRatings] = ids.length
    ? await Promise.all([
        supabase.from('scenario_task_completions').select('assignment_id, task_id, rating').in('assignment_id', ids),
        supabase.from('scenario_task_step_ratings').select('assignment_id, step_id, rating').in('assignment_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (completions.error) throw new Error(`Unable to read the grades: ${completions.error.message}`);
  if (stepRatings.error) throw new Error(`Unable to read the step grades: ${stepRatings.error.message}`);

  return buildSheetSkills({
    tasks: taskRows,
    steps: stepRows,
    assignmentIds: ids,
    completions: (completions.data ?? []) as { assignment_id: string; task_id: string; rating: unknown }[],
    stepRatings: (stepRatings.data ?? []) as { assignment_id: string; step_id: string; rating: unknown }[],
  });
}
