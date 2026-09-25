import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingStepTables } from '@/app/lib/scenario-tasks';
import {
  getSkills,
  skillVariants,
  stepSource,
  stepsForSections,
  type SkillDetail,
  type SkillStep,
} from '@/app/lib/taylor-skills';
import type { ScenarioTaskCategory } from '@/app/lib/scenario-default-tasks';

/**
 * Scenario tasks built from Taylor's skills: one task per skill, whose
 * sub-tasks are the skill's checklist steps word for word — the same rows
 * faculty tick on the paper checklist. A skill with alternative variants
 * (oral, rectal, axillary temperature) gets only the variant chosen, so a
 * student isn't marked down for the routes they were never asked to use.
 */

export interface SkillSelection {
  skillId: string;
  /** Variant headings to include; omitted means the skill's defaults. */
  sections?: string[];
}

/** Vital-sign skills complete on their own when the student records vitals in the app. */
const VITALS_SKILLS = new Set(['1-1', '1-4', '1-5', '1-6', '1-7', '14-1']);

const POINTS_PER_SKILL = 10;

function categoryFor(skill: Pick<SkillDetail, 'title'>): ScenarioTaskCategory {
  return /^(Assessing|Monitoring|Using a Pulse Oximeter)/.test(skill.title) ? 'assessment' : 'intervention';
}

/** The task a skill becomes: its title, goal, and how it is verified. */
export function skillTaskFields(skill: Pick<SkillDetail, 'id' | 'title' | 'goal'>) {
  const vitals = VITALS_SKILLS.has(skill.id);
  return {
    title: skillTaskTitle(skill),
    description: skill.goal ? `Goal: ${skill.goal}` : '',
    category: categoryFor(skill),
    points: POINTS_PER_SKILL,
    verification: (vitals ? 'system' : 'faculty') as 'system' | 'faculty',
    system_trigger: (vitals ? 'vitals' : null) as 'vitals' | null,
  };
}

/** The sub-tasks a skill becomes: its checklist steps for the chosen sections, word for word. */
export function skillTaskSteps<T extends Pick<SkillStep, 'stepNo' | 'section' | 'text'>>(
  skillId: string,
  steps: readonly T[],
  sections?: readonly string[],
): (T & { title: string; source: string })[] {
  const chosen = sections ?? skillVariants(skillId, steps).defaults;
  return stepsForSections(steps, chosen).map((step) => ({ ...step, title: step.text, source: stepSource(skillId, step) }));
}

/** "Assessing Body Temperature (Skill 1-1)" */
export function skillTaskTitle(skill: Pick<SkillDetail, 'id' | 'title'>): string {
  return `${skill.title} (Skill ${skill.id})`;
}

/** Selections from a request body; unknown shapes are dropped. */
export function parseSkillSelections(value: unknown): SkillSelection[] {
  if (!Array.isArray(value)) return [];
  const out: SkillSelection[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push({ skillId: item });
    else if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      const sections = (item as { sections?: unknown }).sections;
      out.push({
        skillId: (item as { id: string }).id,
        sections: Array.isArray(sections) ? sections.filter((x): x is string => typeof x === 'string') : undefined,
      });
    }
  }
  return out;
}

/** A row minus one column, for writing before the migration that adds it. */
function without<T extends object>(row: T, key: string): Partial<T> {
  const copy: Partial<T> = { ...row };
  delete (copy as Record<string, unknown>)[key];
  return copy;
}

const isMissingColumn = (error: { code?: string } | null) => error?.code === '42703' || error?.code === 'PGRST204';

/**
 * The link can't be written: no column before 047, or (23503) the catalog
 * rows it points at aren't seeded yet. The task is still worth writing.
 */
const cannotLink = (error: { code?: string } | null) => isMissingColumn(error) || error?.code === '23503';

/**
 * Append one task per selected skill to a scenario, after `afterSortOrder`.
 * Skills the catalog doesn't have are skipped. Works before migrations
 * 044/047 too: without 047 the skill links are left off, and without 044 the
 * tasks are written without their sub-tasks.
 */
export async function addSkillTasks(
  supabase: SupabaseClient,
  scenarioId: string,
  selections: readonly SkillSelection[],
  afterSortOrder = 0,
): Promise<{ tasks: number; steps: number; error: { message?: string } | null }> {
  const skills = await getSkills(supabase, selections.map((s) => s.skillId));
  if (skills.length === 0) return { tasks: 0, steps: 0, error: null };
  const sectionsFor = new Map(selections.map((s) => [s.skillId, s.sections]));

  const taskRows = skills.map((skill, i) => ({
    scenario_id: scenarioId,
    skill_id: skill.id,
    ...skillTaskFields(skill),
    sort_order: afterSortOrder + i + 1,
  }));

  let inserted = await supabase.from('scenario_tasks').insert(taskRows).select('id, skill_id, sort_order');
  let linked = true;
  if (inserted.error && cannotLink(inserted.error)) {
    // Written without the skill link; matched back by sort order.
    linked = false;
    inserted = await supabase
      .from('scenario_tasks')
      .insert(taskRows.map((row) => without(row, 'skill_id')))
      .select('id, sort_order');
  }
  if (inserted.error) return { tasks: 0, steps: 0, error: inserted.error };

  const taskIdBySort = new Map((inserted.data ?? []).map((t) => [t.sort_order as number, t.id as string]));
  const stepRows = skills.flatMap((skill, i) => {
    const taskId = taskIdBySort.get(afterSortOrder + i + 1);
    if (!taskId) return [];
    return skillTaskSteps(skill.id, skill.steps, sectionsFor.get(skill.id)).map((step, j) => ({
      task_id: taskId,
      title: step.title,
      source: step.source,
      sort_order: j + 1,
      ...(linked && step.id ? { skill_step_id: step.id } : {}),
    }));
  });
  if (stepRows.length === 0) return { tasks: taskRows.length, steps: 0, error: null };

  let steps = await supabase.from('scenario_task_steps').insert(stepRows);
  if (steps.error && cannotLink(steps.error)) {
    steps = await supabase
      .from('scenario_task_steps')
      .insert(stepRows.map((row) => without(row, 'skill_step_id')));
  }
  if (steps.error) {
    if (isMissingStepTables(steps.error)) return { tasks: taskRows.length, steps: 0, error: null };
    return { tasks: taskRows.length, steps: 0, error: steps.error };
  }
  return { tasks: taskRows.length, steps: stepRows.length, error: null };
}
