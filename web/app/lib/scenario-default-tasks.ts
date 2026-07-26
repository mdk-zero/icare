import type { SupabaseClient } from '@supabase/supabase-js';

export type ScenarioTaskCategory =
  | 'assessment'
  | 'intervention'
  | 'medication'
  | 'communication'
  | 'documentation';

export interface ScenarioTaskSeed {
  title: string;
  description: string;
  category: ScenarioTaskCategory;
  points: number;
  verification: 'system' | 'faculty';
  system_trigger: 'vitals' | 'charting' | null;
}

/**
 * The starter checklist every scenario gets. System tasks auto-complete from
 * the student's in-app actions (recording vitals / charting); the rest are
 * verified by faculty. Kept in sync with the backfill in migration 024.
 */
export const DEFAULT_SCENARIO_TASKS: ScenarioTaskSeed[] = [
  { title: 'Assess Patient Vital Signs', description: 'Measure heart rate, blood pressure, temperature, and respiratory rate', category: 'assessment', points: 10, verification: 'system', system_trigger: 'vitals' },
  { title: 'Review Medical History', description: "Check the patient's allergies, current medications, and past conditions", category: 'assessment', points: 10, verification: 'faculty', system_trigger: null },
  { title: 'Perform Physical Examination', description: 'Conduct a head-to-toe physical assessment', category: 'assessment', points: 15, verification: 'faculty', system_trigger: null },
  { title: 'Administer Medication', description: 'Give the prescribed medication with proper technique', category: 'medication', points: 15, verification: 'faculty', system_trigger: null },
  { title: 'Develop Care Plan', description: 'Create a nursing care plan based on patient needs', category: 'intervention', points: 15, verification: 'faculty', system_trigger: null },
  { title: 'Document Assessment', description: 'Accurately document findings in the patient chart', category: 'documentation', points: 10, verification: 'system', system_trigger: 'charting' },
  { title: 'Communicate with Patient', description: 'Explain the procedure and provide health education', category: 'communication', points: 10, verification: 'faculty', system_trigger: null },
  { title: 'Notify Healthcare Team', description: 'Report significant findings to the physician', category: 'communication', points: 15, verification: 'faculty', system_trigger: null },
];

/** Seed a brand-new scenario with the default classified task list. */
export async function seedScenarioTasks(
  supabase: SupabaseClient,
  scenarioId: string,
): Promise<void> {
  const rows = DEFAULT_SCENARIO_TASKS.map((t, index) => ({
    scenario_id: scenarioId,
    title: t.title,
    description: t.description,
    category: t.category,
    points: t.points,
    verification: t.verification,
    system_trigger: t.system_trigger,
    sort_order: index + 1,
  }));
  const { error } = await supabase.from('scenario_tasks').insert(rows);
  if (error) console.error('seedScenarioTasks failed', error);
}
