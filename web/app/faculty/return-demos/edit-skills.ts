import type { ReturnDemoTask, SkillSelection } from "../../lib/api";

/**
 * The skills an edit saves: the ones already on the Return Demonstration
 * that weren't removed, exactly as they are, then the new picks with their
 * variants. A kept skill's variant can't change here (its steps are already
 * the checklist students may have been graded on), so a pick naming a skill
 * it already has is ignored rather than saved and silently dropped.
 */
export function editedSkills(
  existing: readonly Pick<ReturnDemoTask, "skill_id">[],
  removed: ReadonlySet<string>,
  picks: readonly SkillSelection[],
): SkillSelection[] {
  const kept = [...new Set(existing.map((t) => t.skill_id).filter((id): id is string => !!id && !removed.has(id)))];
  const have = new Set(existing.map((t) => t.skill_id));
  return [...kept.map((id) => ({ id })), ...picks.filter((p) => !have.has(p.id))];
}
