import type { ChecklistStep, SkillDetail, SkillSelection, SkillStepDraft } from "../../lib/api";
import { checklistProblem, parseSkillSelections, skillName } from "../../lib/skill-checklists";

/**
 * How the skill editor reads a skill: the checklist it stands at, the variant
 * that checklist follows, and whether it still matches the book. Shared by
 * the skill picker, the steps preview and the forms that load saved skills.
 */

/** A stored task as the editor holds it, with its steps as they were saved. */
export function taskSelection(task: {
  id: string;
  title: string;
  skill_id: string | null;
  chapter: number | null;
  checklist: ChecklistStep[];
  graded: number | boolean;
}): SkillSelection {
  const steps = task.checklist.map((s) => ({ text: s.title, id: s.id, skill_step_id: s.skill_step_id }));
  const locked = Number(task.graded) > 0 ? { locked: true } : {};
  return task.skill_id
    ? { id: task.skill_id, task_id: task.id, title: skillName(task.title), steps, ...locked }
    : { id: `own:${task.id}`, own: true, task_id: task.id, title: task.title, chapter: task.chapter, steps, ...locked };
}

let ownCount = 0;

/** A blank skill of the instructor's own, ready to name and fill. */
export function newOwnSkill(chapter: number | null = null): SkillSelection {
  ownCount += 1;
  return { id: `own:new-${Date.now()}-${ownCount}`, own: true, title: "", chapter, steps: [] };
}

/** The chapter a skill is filed under: a Taylor's skill's number says ("1-7" is 1); an own skill's is chosen. */
export function chapterOf(sel: SkillSelection): number | null {
  return sel.own ? (sel.chapter ?? null) : Number(sel.id.split("-")[0]) || null;
}

/** The book's steps for the given variant, minus any left out. */
export function bookSteps(detail: SkillDetail, sections: readonly string[], skipped: readonly number[] = []): SkillStepDraft[] {
  return detail.steps
    .filter((st) => (st.section === null || sections.includes(st.section)) && !skipped.includes(st.position))
    .map((st) => ({ text: st.text, position: st.position, skill_step_id: st.id }));
}

/** The checklist a skill stands at: as edited, else the book's. Null while the book's is loading. */
export function checklistOf(sel: SkillSelection, detail: SkillDetail | undefined): SkillStepDraft[] | null {
  if (sel.steps) return sel.steps;
  if (sel.own) return [];
  if (!detail) return null;
  return bookSteps(detail, sel.sections ?? detail.variants.defaults, sel.skipped);
}

function bookStepOf(step: SkillStepDraft, detail: SkillDetail) {
  if (step.position !== undefined) return detail.steps.find((s) => s.position === step.position);
  if (step.skill_step_id) return detail.steps.find((s) => s.id === step.skill_step_id);
  return detail.steps.find((s) => s.text === step.text);
}

/** The variant a Taylor's skill follows: as chosen, else the one its saved steps come from, else the defaults. */
export function sectionsOf(sel: SkillSelection, detail: SkillDetail): string[] {
  if (sel.sections) return sel.sections;
  if (sel.steps) {
    const found = new Set(sel.steps.map((st) => bookStepOf(st, detail)?.section).filter((s): s is string => !!s));
    if (found.size > 0) return detail.variants.sections.filter((s) => found.has(s));
  }
  return detail.variants.defaults;
}

/** Whether a Taylor's skill's checklist differs from the book's for its variant. */
export function isEdited(sel: SkillSelection, detail: SkillDetail): boolean {
  if (!sel.steps) return (sel.skipped?.length ?? 0) > 0;
  const book = bookSteps(detail, sectionsOf(sel, detail));
  return book.length !== sel.steps.length || book.some((st, i) => st.text !== sel.steps![i].text);
}

/** Why the skills can't be saved yet, or null: the server's own rule, run before sending. */
export function checklistIssue(value: readonly SkillSelection[]): string | null {
  return checklistProblem(parseSkillSelections(value));
}

/** The warning when own skills' chapters weren't saved (before migration 093). */
export const CHAPTERS_NOT_SAVED =
  "Saved. Your own skills' chapters need database migration 093 applied first, so they were left off.";
