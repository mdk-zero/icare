import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingStepTables } from '@/app/lib/scenario-tasks';
import { readMatching } from '@/app/lib/fetch-all';
import {
  getSkills,
  skillIdFromTitle,
  skillVariants,
  stepSource,
  stepsForSections,
  type SkillDetail,
  type SkillStep,
} from '@/app/lib/taylor-skills';
import type { ScenarioTaskCategory } from '@/app/lib/scenario-default-tasks';
import {
  planSkillTasks,
  planStepChanges,
  skillTaskTitle as titleWithNumber,
  type SkillSelection,
  type StepInput,
  type StoredSkillTask,
} from '@/app/lib/skill-checklists';

/**
 * Scenario tasks built from skills: one task per skill, whose sub-tasks are
 * its checklist steps. A Taylor's skill starts from the book's steps word for
 * word, the same rows faculty tick on the paper checklist; a skill with
 * alternative variants (oral, rectal, axillary temperature) gets only the
 * variant chosen, so a student isn't marked down for the routes they were
 * never asked to use. The instructor may rename a skill, write their own, and
 * add, edit, delete or move its steps (skill-checklists.ts).
 */

// Selections are parsed in skill-checklists.ts, which the browser can import.
export { parseSkillSelections, type SkillSelection } from '@/app/lib/skill-checklists';

const POINTS_PER_SKILL = 10;

function categoryFor(skill: { title: string }): ScenarioTaskCategory {
  return /^(Assessing|Monitoring|Using a Pulse Oximeter)/.test(skill.title) ? 'assessment' : 'intervention';
}

/**
 * The task a skill becomes: its title and goal. Every skill is rated by the
 * instructor during RetDem — students no longer chart on the ward, so nothing
 * completes on its own (migration 057).
 */
export function skillTaskFields(skill: Pick<SkillDetail, 'id' | 'title' | 'goal'>) {
  return {
    title: titleWithNumber(skill.title, skill.id),
    description: skill.goal ? `Goal: ${skill.goal}` : '',
    category: categoryFor(skill),
    points: POINTS_PER_SKILL,
    verification: 'faculty' as const,
    system_trigger: null,
  };
}

/**
 * The sub-tasks a skill becomes: its checklist steps for the chosen sections,
 * word for word, minus any steps faculty left out. Leaving out every step
 * keeps them all, so a task never ends up empty.
 */
export function skillTaskSteps<T extends Pick<SkillStep, 'stepNo' | 'section' | 'text' | 'position'>>(
  skillId: string,
  steps: readonly T[],
  sections?: readonly string[],
  skipped?: readonly number[],
): (T & { title: string; source: string })[] {
  const chosen = stepsForSections(steps, sections ?? skillVariants(skillId, steps).defaults);
  const kept = skipped?.length ? chosen.filter((step) => !skipped.includes(step.position)) : chosen;
  return (kept.length > 0 ? kept : chosen).map((step) => ({ ...step, title: step.text, source: stepSource(skillId, step) }));
}


/** The task an instructor's own skill becomes. */
export function ownTaskFields(title: string) {
  return {
    title,
    description: '',
    category: categoryFor({ title }),
    points: POINTS_PER_SKILL,
    verification: 'faculty' as const,
    system_trigger: null,
  };
}

/** A sub-task row: the step's words and, while they are still the book's, the step they cite. */
export interface StepRow {
  title: string;
  source: string;
  skill_step_id: string | null;
}

/**
 * One step as the form sent it. A step still worded as the book's cites it
 * ("Skill 1-1, step 3") and links to it; one the instructor wrote or reworded
 * is theirs, so it cites nothing.
 */
function stepRow(step: StepInput, skill: Pick<SkillDetail, 'id' | 'steps'> | null): StepRow {
  const from = skill && step.position !== undefined ? skill.steps.find((s) => s.position === step.position) : undefined;
  return from && skill && from.text === step.text
    ? { title: step.text, source: stepSource(skill.id, from), skill_step_id: from.id }
    : { title: step.text, source: '', skill_step_id: null };
}

/** The sub-tasks a selection becomes: its edited checklist, or the book's for the chosen variant. */
export function selectionSteps(sel: SkillSelection, skill: Pick<SkillDetail, 'id' | 'steps'> | null): StepRow[] {
  if (sel.steps) return sel.steps.map((step) => stepRow(step, skill));
  if (!skill) return [];
  return skillTaskSteps(skill.id, skill.steps, sel.sections, sel.skipped).map((st) => ({
    title: st.title,
    source: st.source,
    skill_step_id: st.id,
  }));
}

/** A row minus one column, for writing before the migration that adds it. */
function without<T extends object>(row: T, key: string): Partial<T> {
  const copy: Partial<T> = { ...row };
  delete (copy as Record<string, unknown>)[key];
  return copy;
}

type DbError = { code?: string; message?: string } | null;

const isMissingColumn = (error: DbError) => error?.code === '42703' || error?.code === 'PGRST204';
const missingColumn = (error: DbError, column: string) => isMissingColumn(error) && !!error?.message?.includes(column);

/**
 * The link can't be written: no column before 047, or (23503) the catalog
 * rows it points at aren't seeded yet. The task is still worth writing.
 */
const cannotLink = (error: DbError) => isMissingColumn(error) || error?.code === '23503';

/**
 * Task rows written with what the database has: an own skill's chapter
 * needs 093 and a skill link 047, and a row is still worth writing without
 * either. Says which were left off.
 */
async function insertTaskRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<{ data: { id: string; sort_order: number }[]; error: DbError; noChapters: boolean; unlinked: boolean }> {
  let attempt = rows;
  let noChapters = false;
  let unlinked = false;
  for (;;) {
    const res = await supabase.from('scenario_tasks').insert(attempt).select('id, sort_order');
    if (!res.error) return { data: (res.data ?? []) as { id: string; sort_order: number }[], error: null, noChapters, unlinked };
    if (!noChapters && missingColumn(res.error, 'chapter')) {
      noChapters = true;
      attempt = attempt.map((row) => without(row, 'chapter'));
    } else if (!unlinked && cannotLink(res.error)) {
      unlinked = true;
      attempt = attempt.map((row) => without(row, 'skill_id'));
    } else {
      return { data: [], error: res.error, noChapters, unlinked };
    }
  }
}

/** Sub-task rows, without their catalog links before 047; none at all before 044. */
async function insertStepRows(supabase: SupabaseClient, rows: Record<string, unknown>[]): Promise<DbError> {
  if (rows.length === 0) return null;
  let res = await supabase.from('scenario_task_steps').insert(rows);
  if (res.error && cannotLink(res.error)) {
    res = await supabase.from('scenario_task_steps').insert(rows.map((row) => without(row, 'skill_step_id')));
  }
  if (res.error && !isMissingStepTables(res.error)) return res.error;
  return null;
}

export interface SkillTaskWrite {
  tasks: number;
  steps: number;
  error: DbError;
  /** An own skill's chapter was left off: migration 093 isn't applied. */
  noChapters: boolean;
}

/** Write the given skills as tasks at the given places. Taylor's skills the catalog doesn't have are skipped. */
async function insertSkillTasks(
  supabase: SupabaseClient,
  scenarioId: string,
  items: readonly { selection: SkillSelection; sortOrder: number }[],
): Promise<SkillTaskWrite> {
  const catalogIds = items.flatMap((i) => (i.selection.skillId ? [i.selection.skillId] : []));
  const skills = new Map((catalogIds.length ? await getSkills(supabase, catalogIds) : []).map((s) => [s.id, s]));
  const built = items.flatMap(({ selection, sortOrder }) => {
    if (selection.skillId === null) return [{ selection, sortOrder, skill: null }];
    const skill = skills.get(selection.skillId);
    return skill ? [{ selection, sortOrder, skill }] : [];
  });
  if (built.length === 0) return { tasks: 0, steps: 0, error: null, noChapters: false };

  const rows = built.map(({ selection, sortOrder, skill }) => ({
    scenario_id: scenarioId,
    ...(skill
      ? {
          skill_id: skill.id,
          ...skillTaskFields(skill),
          ...(selection.title ? { title: titleWithNumber(selection.title, skill.id) } : {}),
        }
      : { ...ownTaskFields(selection.title ?? ''), ...(selection.chapter ? { chapter: selection.chapter } : {}) }),
    sort_order: sortOrder,
  }));
  const inserted = await insertTaskRows(supabase, rows);
  if (inserted.error) return { tasks: 0, steps: 0, error: inserted.error, noChapters: inserted.noChapters };

  const taskIdBySort = new Map(inserted.data.map((t) => [t.sort_order, t.id]));
  const stepRows = built.flatMap(({ selection, sortOrder, skill }) => {
    const taskId = taskIdBySort.get(sortOrder);
    if (!taskId) return [];
    return selectionSteps(selection, skill).map((step, j) => ({
      task_id: taskId,
      title: step.title,
      source: step.source,
      sort_order: j + 1,
      ...(!inserted.unlinked && step.skill_step_id ? { skill_step_id: step.skill_step_id } : {}),
    }));
  });
  const stepError = await insertStepRows(supabase, stepRows);
  return { tasks: rows.length, steps: stepError ? 0 : stepRows.length, error: stepError, noChapters: inserted.noChapters };
}

/**
 * Append one task per selected skill to a scenario, after `afterSortOrder`.
 * Works before migrations 044/047 too: without 047 the skill links are left
 * off, and without 044 the tasks are written without their sub-tasks.
 */
export async function addSkillTasks(
  supabase: SupabaseClient,
  scenarioId: string,
  selections: readonly SkillSelection[],
  afterSortOrder = 0,
): Promise<SkillTaskWrite> {
  return insertSkillTasks(
    supabase,
    scenarioId,
    selections.map((selection, i) => ({ selection, sortOrder: afterSortOrder + i + 1 })),
  );
}

export interface LoadedSkillTask extends StoredSkillTask {
  steps: { id: string; title: string; sort_order: number; skill_step_id: string | null }[];
  /** How many students have a grade on it. */
  graded: number;
}

/**
 * A scenario's tasks in order, each with its steps and how many students are
 * graded on it. Reads what the database has: no chapter before 093, no skill
 * link before 047 (the skill is then the "(Skill 1-7)" its title ends with),
 * no steps before 044.
 */
export async function loadSkillTasks(supabase: SupabaseClient, scenarioId: string): Promise<LoadedSkillTask[]> {
  type Row = { id: string; title: string; sort_order: number; skill_id?: string | null; chapter?: number | null };
  const read = (columns: string) =>
    supabase.from('scenario_tasks').select(columns).eq('scenario_id', scenarioId).order('sort_order');
  let res = await read('id, title, sort_order, skill_id, chapter');
  if (missingColumn(res.error, 'chapter')) res = await read('id, title, sort_order, skill_id');
  const linked = !isMissingColumn(res.error);
  if (!linked) res = await read('id, title, sort_order');
  if (res.error) throw new Error(`Unable to read the skills: ${res.error.message}`);
  const rows = (res.data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];
  const taskIds = rows.map((t) => t.id);

  type StepRead = { id: string; task_id: string; title: string; sort_order: number; skill_step_id?: string | null };
  const readSteps = (columns: string) =>
    readMatching<StepRead>(taskIds, (part, from, to) =>
      supabase.from('scenario_task_steps').select(columns).in('task_id', part).order('id').range(from, to),
    );
  let steps: StepRead[] = [];
  try {
    steps = await readSteps('id, task_id, title, sort_order, skill_step_id');
  } catch (err) {
    if (cannotLink(err as DbError)) steps = await readSteps('id, task_id, title, sort_order').catch(() => []);
    else if (!isMissingStepTables(err as DbError)) throw err;
  }

  const completions = await readMatching<{ task_id: string; assignment_id: string }>(taskIds, (part, from, to) =>
    supabase.from('scenario_task_completions').select('task_id, assignment_id').in('task_id', part).order('id').range(from, to),
  );
  const graded = new Map<string, Set<string>>();
  for (const c of completions) graded.set(c.task_id, (graded.get(c.task_id) ?? new Set()).add(c.assignment_id));

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    sort_order: t.sort_order,
    skill_id: linked ? (t.skill_id ?? null) : skillIdFromTitle(t.title),
    chapter: t.chapter ?? null,
    steps: steps
      .filter((s) => s.task_id === t.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, title: s.title, sort_order: s.sort_order, skill_step_id: s.skill_step_id ?? null })),
    graded: graded.get(t.id)?.size ?? 0,
  }));
}

/**
 * Bring a scenario's skills to the list an edit sends: new skills are added,
 * kept ones renamed, refiled or given their edited checklist, dropped ones
 * removed, and all put in the order sent. Every check runs before any write,
 * so a refused edit (a graded skill changed, or none left when one is
 * required) changes nothing.
 */
export async function saveSkillTasks(
  supabase: SupabaseClient,
  scenarioId: string,
  wanted: readonly SkillSelection[],
  opts: { requireOne?: boolean } = {},
): Promise<
  | { ok: true; added: number; changed: number; removed: number; noChapters: boolean }
  | { ok: false; status: number; error: string }
> {
  const current = await loadSkillTasks(supabase, scenarioId);
  const plan = planSkillTasks(current, wanted, new Set(current.filter((t) => t.graded > 0).map((t) => t.id)));
  if (plan.refused) return { ok: false, ...plan.refused };
  if (opts.requireOne && wanted.length === 0) return { ok: false, status: 400, error: 'Pick at least one skill' };

  let noChapters = false;
  let added = 0;
  if (plan.add.length > 0) {
    const built = await insertSkillTasks(supabase, scenarioId, plan.add);
    if (built.error) throw new Error(`Unable to add the skills: ${built.error.message}`);
    if (opts.requireOne && built.tasks === 0 && plan.add.length === wanted.length) {
      return { ok: false, status: 400, error: 'None of those skills are in the catalog' };
    }
    added = built.tasks;
    noChapters = built.noChapters;
  }

  // Steps added to a kept Taylor's skill can still cite the book.
  const byId = new Map(current.map((t) => [t.id, t]));
  const relinkIds = [
    ...new Set(plan.update.flatMap((u) => (u.steps ? [byId.get(u.taskId)?.skill_id ?? null] : []))),
  ].filter((id): id is string => !!id);
  const catalog = new Map((relinkIds.length ? await getSkills(supabase, relinkIds) : []).map((s) => [s.id, s]));

  for (const change of plan.update) {
    const task = byId.get(change.taskId)!;
    const fields: Record<string, unknown> = {};
    if (change.title !== undefined) fields.title = change.title;
    if (change.chapter !== undefined) fields.chapter = change.chapter;
    if (Object.keys(fields).length > 0) {
      let { error } = await supabase.from('scenario_tasks').update(fields).eq('id', task.id);
      if (error && missingColumn(error, 'chapter')) {
        noChapters = true;
        const rest = without(fields, 'chapter');
        error = Object.keys(rest).length > 0 ? (await supabase.from('scenario_tasks').update(rest).eq('id', task.id)).error : null;
      }
      if (error) throw new Error(`Unable to update ${task.title}: ${error.message}`);
    }
    if (change.steps) await saveSteps(supabase, task, change.steps, task.skill_id ? (catalog.get(task.skill_id) ?? null) : null);
  }

  if (plan.remove.length > 0) {
    const { error } = await supabase.from('scenario_tasks').delete().in('id', plan.remove).eq('scenario_id', scenarioId);
    if (error) throw new Error(`Unable to remove the skills: ${error.message}`);
  }
  for (const move of plan.reorder) {
    const { error } = await supabase.from('scenario_tasks').update({ sort_order: move.sortOrder }).eq('id', move.taskId);
    if (error) throw new Error(`Unable to reorder the skills: ${error.message}`);
  }
  return { ok: true, added, changed: plan.update.length, removed: plan.remove.length, noChapters };
}

/**
 * One kept task's steps brought to the edited list. A reworded step stops
 * citing the book: the words are the instructor's now.
 */
async function saveSteps(
  supabase: SupabaseClient,
  task: LoadedSkillTask,
  wanted: readonly StepInput[],
  skill: Pick<SkillDetail, 'id' | 'steps'> | null,
): Promise<void> {
  const changes = planStepChanges(task.steps, wanted);
  if (changes.remove.length > 0) {
    const { error } = await supabase.from('scenario_task_steps').delete().in('id', changes.remove).eq('task_id', task.id);
    if (error) throw new Error(`Unable to remove steps from ${task.title}: ${error.message}`);
  }
  const stored = new Map(task.steps.map((s) => [s.id, s]));
  for (const step of changes.update) {
    const reworded = stored.get(step.id)?.title !== step.title;
    const fields = { title: step.title, sort_order: step.sortOrder, ...(reworded ? { source: '', skill_step_id: null } : {}) };
    let { error } = await supabase.from('scenario_task_steps').update(fields).eq('id', step.id);
    if (error && cannotLink(error)) {
      ({ error } = await supabase.from('scenario_task_steps').update(without(fields, 'skill_step_id')).eq('id', step.id));
    }
    if (error) throw new Error(`Unable to update a step of ${task.title}: ${error.message}`);
  }
  const error = await insertStepRows(
    supabase,
    changes.insert.map(({ step, sortOrder }) => {
      const row = stepRow(step, skill);
      return {
        task_id: task.id,
        title: row.title,
        source: row.source,
        sort_order: sortOrder,
        ...(row.skill_step_id ? { skill_step_id: row.skill_step_id } : {}),
      };
    }),
  );
  if (error) throw new Error(`Unable to add steps to ${task.title}: ${error.message}`);
}
