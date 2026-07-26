import type { SupabaseClient } from '@supabase/supabase-js';

export type ScenarioTaskTrigger = 'vitals' | 'charting';

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
