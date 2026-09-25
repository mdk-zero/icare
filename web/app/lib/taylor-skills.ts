// Server code only: it bundles the whole catalog JSON.
import type { SupabaseClient } from '@supabase/supabase-js';
import { TAYLORS_CHAPTERS } from '@/scripts/taylors-chapters';
import bundled from '@/scripts/data/taylor-skills.json';

/**
 * The Taylor's skills catalog: all 188 skills of Lynn & LeBon, "Skill
 * Checklists for Taylor's Clinical Nursing Skills" (3rd ed.), grouped into the
 * 18 chapters that are the app's skill areas, each with its checklist steps
 * word for word.
 *
 * Read from the database (migration 045, loaded by seed-taylor-skills.ts).
 * Until that migration is applied the same content is served from the JSON
 * the seed loads, so the catalog never goes empty — only the step ids that
 * scenario sub-tasks link to are missing (null) in that case.
 */

export interface SkillSummary {
  /** "5-23" */
  id: string;
  chapter: number;
  chapterId: string;
  /** The skill area (chapter) name, e.g. "Medications". */
  area: string;
  title: string;
}

export interface SkillStep {
  /** taylor_skill_steps.id; null when served from the bundled catalog. */
  id: string | null;
  position: number;
  /** The number the book prints; repeats across a skill's variants. */
  stepNo: number;
  section: string | null;
  text: string;
}

export interface SkillDetail extends SkillSummary {
  goal: string;
  steps: SkillStep[];
}

interface BundledSkill {
  id: string;
  chapter: number;
  number: number;
  title: string;
  goal: string;
  steps: { number: number; section: string | null; text: string }[];
}

const BUNDLED = bundled as BundledSkill[];
const CHAPTER = new Map(TAYLORS_CHAPTERS.map((c) => [c.chapter, c]));

function summarise(id: string, chapter: number, title: string): SkillSummary {
  const ch = CHAPTER.get(chapter)!;
  return { id, chapter, chapterId: ch.id, area: ch.name, title };
}

/** "Skill 5-23 · Administering Medication via a Metered-Dose Inhaler (MDI)" */
export function skillLabel(skill: Pick<SkillSummary, 'id' | 'title'>): string {
  return `Skill ${skill.id} · ${skill.title}`;
}

/** Sort key so "5-9" comes before "5-10". */
export function compareSkillIds(a: string, b: string): number {
  const [ac, an] = a.split('-').map(Number);
  const [bc, bn] = b.split('-').map(Number);
  return ac - bc || an - bn;
}

export function isSkillId(value: unknown): value is string {
  return typeof value === 'string' && BUNDLED.some((s) => s.id === value);
}

/** Every skill, in book order, without steps. */
export async function listSkills(supabase: SupabaseClient): Promise<SkillSummary[]> {
  const { data, error } = await supabase.from('taylor_skills').select('id, chapter, title');
  if (error || !data || data.length === 0) {
    return BUNDLED.map((s) => summarise(s.id, s.chapter, s.title));
  }
  return data
    .map((s) => summarise(s.id as string, s.chapter as number, s.title as string))
    .sort((a, b) => compareSkillIds(a.id, b.id));
}

/** The named skills with their steps, in the order asked for; unknown ids are dropped. */
export async function getSkills(supabase: SupabaseClient, ids: string[]): Promise<SkillDetail[]> {
  const wanted = [...new Set(ids.filter(isSkillId))];
  if (wanted.length === 0) return [];

  const [{ data: skills, error }, { data: steps, error: stepsError }] = await Promise.all([
    supabase.from('taylor_skills').select('id, chapter, title, goal').in('id', wanted),
    supabase
      .from('taylor_skill_steps')
      .select('id, skill_id, position, step_no, section, text')
      .in('skill_id', wanted)
      .order('position'),
  ]);

  if (error || stepsError || !skills || skills.length !== wanted.length) {
    return wanted.map((id) => {
      const s = BUNDLED.find((b) => b.id === id)!;
      return {
        ...summarise(s.id, s.chapter, s.title),
        goal: s.goal,
        steps: s.steps.map((st, i) => ({ id: null, position: i + 1, stepNo: st.number, section: st.section, text: st.text })),
      };
    });
  }

  return wanted.map((id) => {
    const s = skills.find((r) => r.id === id)!;
    return {
      ...summarise(s.id as string, s.chapter as number, s.title as string),
      goal: (s.goal as string) ?? '',
      steps: (steps ?? [])
        .filter((st) => st.skill_id === id)
        .map((st) => ({
          id: st.id as string,
          position: st.position as number,
          stepNo: st.step_no as number,
          section: (st.section as string | null) ?? null,
          text: st.text as string,
        })),
    };
  });
}

/** How a sub-task cites the book: "Skill 1-1, step 3" or "Skill 1-1, Assessing Oral Temperature, step 12". */
export function stepSource(skillId: string, step: Pick<SkillStep, 'stepNo' | 'section'>): string {
  return step.section
    ? `Skill ${skillId}, ${step.section}, step ${step.stepNo}`
    : `Skill ${skillId}, step ${step.stepNo}`;
}
