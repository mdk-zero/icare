/**
 * The skills on a Patient Case or Return Demonstration as an instructor edits
 * them. Each skill is a task and its checklist steps are the sub-tasks the
 * student demonstrates. A skill is a Taylor's skill (its steps start as the
 * book's, word for word) or the instructor's own, filed under a chapter. Either
 * way the instructor can rename it and add, edit, delete or move its steps.
 * Those changes belong to the one activity; the catalog never changes.
 *
 * Pure, so the API routes, the forms and the demo share it.
 */

export const MAX_SKILL_TITLE = 200;
export const MAX_STEP_TEXT = 1000;
export const MAX_STEPS = 100;
/** Chapters an own skill can be filed under: the book's 18. */
export const MAX_CHAPTER = 18;

/** One checklist step as the form sends it. */
export interface StepInput {
  text: string;
  /** The catalog step it was taken from (its position in the skill), for a Taylor's skill. */
  position?: number;
  /** The stored sub-task it is, when editing one. */
  id?: string;
}

/** A skill picked or written for an activity. */
export interface SkillSelection {
  /** The Taylor's skill ("1-7"); null for the instructor's own. */
  skillId: string | null;
  /** Variant headings to include; omitted means the skill's defaults. */
  sections?: string[];
  /** Checklist steps left out (their positions), when the setting doesn't call for them. */
  skipped?: number[];
  /** Its name: a Taylor's skill renamed, or an own skill's. */
  title?: string;
  /** An own skill's chapter (1–18), or null for one outside the book. */
  chapter?: number | null;
  /** The checklist as edited. It replaces what `sections` and `skipped` would give. */
  steps?: StepInput[];
  /** The stored task it is, when editing. */
  taskId?: string;
}

const isText = (v: unknown): v is string => typeof v === 'string';

function parseSteps(value: unknown): StepInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: StepInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { text, position, id } = item as { text?: unknown; position?: unknown; id?: unknown };
    // A blank row is one the instructor added and never filled in.
    if (!isText(text) || !text.trim()) continue;
    out.push({
      text: text.trim(),
      ...(Number.isInteger(position) ? { position: position as number } : {}),
      ...(isText(id) && id ? { id } : {}),
    });
  }
  return out;
}

function parseChapter(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_CHAPTER ? (value as number) : null;
}

/**
 * Selections from a request body; unknown shapes are dropped. A Taylor's
 * skill is `"1-7"` or `{ id, sections?, skipped?, title?, steps?, task_id? }`;
 * an own skill is `{ own: true, title, chapter?, steps, task_id? }`. A
 * Taylor's skill keeps its first mention.
 */
export function parseSkillSelections(value: unknown): SkillSelection[] {
  if (!Array.isArray(value)) return [];
  const out: SkillSelection[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (isText(item)) {
      if (!seen.has(item)) out.push({ skillId: item });
      seen.add(item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const own = raw.own === true;
    if (!own && !isText(raw.id)) continue;
    const skillId = own ? null : (raw.id as string);
    if (skillId) {
      if (seen.has(skillId)) continue;
      seen.add(skillId);
    }
    const steps = parseSteps(raw.steps);
    out.push({
      skillId,
      ...(Array.isArray(raw.sections) ? { sections: raw.sections.filter(isText) } : {}),
      ...(Array.isArray(raw.skipped) ? { skipped: raw.skipped.filter((x): x is number => Number.isInteger(x)) } : {}),
      ...(isText(raw.title) && raw.title.trim() ? { title: raw.title.trim() } : {}),
      ...(own ? { chapter: parseChapter(raw.chapter) } : {}),
      ...(steps ? { steps } : {}),
      ...(isText(raw.task_id) && raw.task_id ? { taskId: raw.task_id } : {}),
    });
  }
  return out;
}

/** What to call a selection in a message. */
export function selectionLabel(sel: Pick<SkillSelection, 'skillId' | 'title'>): string {
  return sel.title ? `“${sel.title}”` : sel.skillId ? `Skill ${sel.skillId}` : 'your own skill';
}

/**
 * Why these selections can't be saved, or null. An own skill needs a name,
 * and every skill needs a step to grade, except an own skill already saved
 * without any (the general starter tasks are graded as a whole).
 */
export function checklistProblem(selections: readonly SkillSelection[]): string | null {
  for (const sel of selections) {
    if (sel.skillId === null && !sel.title) return 'Give each of your own skills a name.';
    if (sel.title && sel.title.length > MAX_SKILL_TITLE) {
      return `Keep skill names under ${MAX_SKILL_TITLE} characters.`;
    }
    const steps = sel.steps;
    if (sel.skillId === null && !steps?.length && !sel.taskId) return `Add at least one step to ${selectionLabel(sel)}.`;
    if (!steps) continue;
    if (steps.length === 0 && sel.skillId !== null) return `Keep at least one step in ${selectionLabel(sel)}.`;
    if (steps.length > MAX_STEPS) return `Keep ${selectionLabel(sel)} under ${MAX_STEPS} steps.`;
    if (steps.some((s) => s.text.length > MAX_STEP_TEXT)) {
      return `Keep each step of ${selectionLabel(sel)} under ${MAX_STEP_TEXT} characters.`;
    }
  }
  return null;
}

/** "Assessing Body Temperature (Skill 1-1)": a Taylor's skill keeps its number whatever it is called. */
export function skillTaskTitle(name: string, skillId: string | null): string {
  return skillId ? `${name} (Skill ${skillId})` : name;
}

/** A task's title without the "(Skill 1-1)" it ends with: the name an instructor edits. */
export function skillName(title: string): string {
  return title.replace(/\s*\(Skill \d{1,2}-\d{1,2}\)\s*$/, '');
}

/** A task as stored, with its steps in order. */
export interface StoredSkillTask {
  id: string;
  skill_id: string | null;
  title: string;
  chapter: number | null;
  sort_order: number;
  steps: readonly { id: string; title: string }[];
}

export interface SkillTaskUpdate {
  taskId: string;
  title?: string;
  chapter?: number | null;
  steps?: StepInput[];
}

export interface SkillTaskPlan {
  /** New skills, in the order they are wanted. */
  add: { selection: SkillSelection; sortOrder: number }[];
  /** Tasks kept with a new name, chapter or checklist. */
  update: SkillTaskUpdate[];
  /** Tasks taken off, nobody graded on them. */
  remove: string[];
  /** Kept tasks whose place in the list moved. */
  reorder: { taskId: string; sortOrder: number }[];
  /** Why the edit is refused, when it is: it would change or drop a graded skill, or names a task that's gone. */
  refused: { status: 409; error: string } | null;
}

const sameSteps = (stored: StoredSkillTask['steps'], wanted: readonly StepInput[]) =>
  stored.length === wanted.length && stored.every((s, i) => wanted[i].id === s.id && wanted[i].text === s.title);

/**
 * An edit's changes against the tasks it has. The wanted list is the whole
 * list, in order: a stored task it doesn't name is removed. A graded task can
 * be renamed but not removed, and its steps can't change, since a student's
 * grade sits on them; either refuses the whole edit.
 */
export function planSkillTasks(
  current: readonly StoredSkillTask[],
  wanted: readonly SkillSelection[],
  graded: ReadonlySet<string>,
): SkillTaskPlan {
  const byId = new Map(current.map((t) => [t.id, t]));
  const plan: SkillTaskPlan = { add: [], update: [], remove: [], reorder: [], refused: null };
  const kept = new Set<string>();
  const stale: string[] = [];
  const blocked: string[] = [];

  wanted.forEach((sel, i) => {
    const sortOrder = i + 1;
    const task = sel.taskId ? byId.get(sel.taskId) : undefined;
    if (sel.taskId && (!task || kept.has(sel.taskId))) {
      stale.push(sel.taskId);
      return;
    }
    if (!task) {
      plan.add.push({ selection: sel, sortOrder });
      return;
    }
    kept.add(task.id);
    const change: SkillTaskUpdate = { taskId: task.id };
    if (sel.title) {
      const title = skillTaskTitle(sel.title, task.skill_id);
      if (title !== task.title) change.title = title;
    }
    if (task.skill_id === null && sel.chapter !== undefined && sel.chapter !== task.chapter) change.chapter = sel.chapter;
    if (sel.steps && !sameSteps(task.steps, sel.steps)) {
      if (graded.has(task.id)) blocked.push(task.title);
      else change.steps = sel.steps;
    }
    if (Object.keys(change).length > 1) plan.update.push(change);
    if (task.sort_order !== sortOrder) plan.reorder.push({ taskId: task.id, sortOrder });
  });

  for (const task of current) {
    if (kept.has(task.id)) continue;
    if (graded.has(task.id)) blocked.push(task.title);
    else plan.remove.push(task.id);
  }

  if (stale.length > 0) {
    plan.refused = { status: 409, error: 'These skills changed since you opened them. Reload the page and try again.' };
  } else if (blocked.length > 0) {
    plan.refused = {
      status: 409,
      error: `Students have been graded on ${blocked.join(', ')}, so it has to stay as it is.`,
    };
  }
  return plan;
}

/**
 * A stored step list brought to the wanted one: rows kept by id get their
 * new words and place, new rows are added, and the rest are deleted.
 */
export function planStepChanges(
  stored: readonly { id: string; title: string; sort_order: number }[],
  wanted: readonly StepInput[],
): {
  insert: { step: StepInput; sortOrder: number }[];
  update: { id: string; title: string; sortOrder: number }[];
  remove: string[];
} {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const used = new Set<string>();
  const insert: { step: StepInput; sortOrder: number }[] = [];
  const update: { id: string; title: string; sortOrder: number }[] = [];
  wanted.forEach((step, i) => {
    const sortOrder = i + 1;
    const row = step.id ? byId.get(step.id) : undefined;
    if (!row || used.has(row.id)) {
      insert.push({ step, sortOrder });
      return;
    }
    used.add(row.id);
    if (row.title !== step.text || row.sort_order !== sortOrder) update.push({ id: row.id, title: step.text, sortOrder });
  });
  return { insert, update, remove: stored.filter((s) => !used.has(s.id)).map((s) => s.id) };
}
