import type { getSupabaseAdmin } from './supabase/server';
import { MASTERY_THRESHOLD, type SkillMastery } from './bkt';
import { listSkills } from './taylor-skills';

/**
 * A student's overall standing, for the top of the mobile Library's
 * recommendations and the AI study tips: what Bayesian Knowledge Tracing says
 * across every skill they have results on (their quizzes, Patient Cases and
 * Return Demonstrations together; Case Presentations aren't skills laboratory
 * work), and how each chapter stands. It is general on purpose: it says how
 * well they know each skill, not which piece of work showed it.
 *
 * This is what keeps the recommendations about the whole student rather than
 * one competency: the study tips are written from it.
 */

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface ChapterStanding {
  chapter: number;
  area: string;
  /** Mean BKT mastery of the chapter's skills the student has results on, 0-1. */
  mastery: number;
  skills: number;
}

export interface StudyProfile {
  /** Mean BKT mastery over every skill with results, 0-1; null with none. */
  mastery: number | null;
  /** Skills with results, and how many of them are mastered (MASTERY_THRESHOLD). */
  skills: number;
  mastered: number;
  /** Weakest first. */
  chapters: ChapterStanding[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

/** The profile from a student's BKT estimates (loadSkillMastery). */
export async function loadStudyProfile(supabase: Supabase, mastery: readonly SkillMastery[]): Promise<StudyProfile> {
  const catalog = await listSkills(supabase);
  const skillById = new Map(catalog.map((s) => [s.id, s]));
  const byChapter = new Map<number, { area: string; values: number[] }>();
  for (const m of mastery) {
    const skill = skillById.get(m.skill_id);
    if (!skill) continue;
    const entry = byChapter.get(skill.chapter) ?? { area: skill.area, values: [] };
    entry.values.push(m.mastery);
    byChapter.set(skill.chapter, entry);
  }
  const chapters = [...byChapter.entries()]
    .map(([chapter, { area, values }]) => ({ chapter, area, mastery: round3(mean(values)) ?? 0, skills: values.length }))
    .sort((a, b) => a.mastery - b.mastery || a.chapter - b.chapter);

  return {
    mastery: round3(mean(mastery.map((m) => m.mastery))),
    skills: mastery.length,
    mastered: mastery.filter((m) => m.mastery >= MASTERY_THRESHOLD).length,
    chapters,
  };
}
