// Server code only: it bundles the whole catalog JSON.
import type { SupabaseClient } from '@supabase/supabase-js';
import { TAYLORS_CHAPTERS } from '@/scripts/taylors-chapters';
import bundled from '@/scripts/data/taylor-skills.json';

/**
 * The Taylor's skills catalog: the skills of Chapters 1, 14 and 15 of Lynn & LeBon, "Skill
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

/** The variant headings of a skill ("Assessing Oral Temperature"), and which a scenario gets by default. */
export interface SkillVariants {
  sections: string[];
  /**
   * True when the sections are alternatives — the book restarts its step
   * numbers under each (oral, rectal, axillary temperature), so a student
   * performs one of them, not all.
   */
  alternatives: boolean;
  /** Every section when they run in sequence; the first when they are alternatives. */
  defaults: string[];
}

/**
 * Skills whose sections are alternatives although the book numbers them on:
 * 15-2 changes the container alone (steps 8–14) or with its set (15–24).
 */
const ALTERNATIVES_NUMBERED_ON = new Set(['15-2']);

export function skillVariants(
  skillId: string,
  steps: readonly Pick<SkillStep, 'stepNo' | 'section'>[],
): SkillVariants {
  const sections: string[] = [];
  const firstNo = new Map<string, number>();
  let highest = 0;
  let restartsAt: number | null = null;
  for (const step of steps) {
    if (step.section && !firstNo.has(step.section)) {
      sections.push(step.section);
      firstNo.set(step.section, step.stepNo);
      if (step.stepNo <= highest) restartsAt = step.stepNo;
    }
    highest = Math.max(highest, step.stepNo);
  }
  if (ALTERNATIVES_NUMBERED_ON.has(skillId) && sections.length > 0) {
    return { sections, alternatives: true, defaults: sections.slice(0, 1) };
  }
  if (restartsAt === null) return { sections, alternatives: false, defaults: sections };
  return { sections, alternatives: true, defaults: sections.filter((s) => firstNo.get(s) === restartsAt).slice(0, 1) };
}

/** The steps a scenario gets for a skill: the shared ones plus the chosen sections. */
export function stepsForSections<T extends Pick<SkillStep, 'section'>>(steps: readonly T[], sections: readonly string[]): T[] {
  return steps.filter((s) => s.section === null || sections.includes(s.section));
}

/** "1-7: Assessing Brachial Artery Blood Pressure", one per line — the catalog as a prompt sees it. */
export function catalogPromptLines(): string {
  return BUNDLED.map((s) => `${s.id}: ${s.title}`).join('\n');
}
