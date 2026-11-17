import { updateMastery, type BktParams } from './bkt';

/**
 * A student's mastery of each skill over time, traced from their answers in
 * order: the estimate at the end of each day they answered on it. Pure, so the
 * server (skill-mastery.ts) and the demo build it the same way.
 */

/** One day on a skill's history: the estimate after that day's last answer. */
export interface MasteryPoint {
  /** The day, as YYYY-MM-DD in Philippine time. */
  day: string;
  /** The last answer of the day, as stored. */
  at: string;
  mastery: number;
  /** Answers on the skill that day, and how many were right. */
  answers: number;
  correct: number;
}

export interface SkillMasteryHistory {
  skill_id: string;
  title: string;
  /** Its Taylor's chapter and that chapter's skill area, e.g. 1 and "Vital Signs". */
  chapter: number;
  area: string;
  /** Where the estimate stands now: the last point's mastery. */
  mastery: number;
  answers: number;
  points: MasteryPoint[];
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const manilaDay = (iso: string) => new Date(Date.parse(iso) + MANILA_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Every skill's history from answers already oldest first. `paramsFor` gives
 * a skill's BKT parameters; `summaryOf` its title, chapter and skill area.
 */
export function traceMasteryHistory(
  answers: readonly { skill_id: string; at: string | null; correct: boolean }[],
  paramsFor: (skillId: string) => BktParams,
  summaryOf: (skillId: string) => { title: string; chapter: number; area: string } | undefined,
): SkillMasteryHistory[] {
  const perSkill = new Map<string, { at: string; correct: boolean }[]>();
  for (const a of answers) {
    if (!a.at) continue;
    perSkill.set(a.skill_id, [...(perSkill.get(a.skill_id) ?? []), { at: a.at, correct: a.correct }]);
  }

  return [...perSkill.keys()]
    .map((skill): SkillMasteryHistory => {
      const params = paramsFor(skill);
      const points: MasteryPoint[] = [];
      let known = params.p_init;
      for (const answer of perSkill.get(skill)!) {
        known = updateMastery(known, answer.correct, params);
        const day = manilaDay(answer.at);
        const last = points[points.length - 1];
        if (last && last.day === day) {
          Object.assign(last, {
            at: answer.at,
            mastery: known,
            answers: last.answers + 1,
            correct: last.correct + (answer.correct ? 1 : 0),
          });
        } else {
          points.push({ day, at: answer.at, mastery: known, answers: 1, correct: answer.correct ? 1 : 0 });
        }
      }
      const summary = summaryOf(skill);
      const chapter = summary?.chapter ?? (Number(skill.split('-')[0]) || 0);
      return {
        skill_id: skill,
        title: summary?.title ?? `Skill ${skill}`,
        chapter,
        area: summary?.area ?? `Chapter ${chapter}`,
        mastery: known,
        answers: perSkill.get(skill)!.length,
        points,
      };
    })
    // Most practised first: the skills with the most history to show.
    .sort((a, b) => b.answers - a.answers || a.skill_id.localeCompare(b.skill_id, undefined, { numeric: true }));
}
