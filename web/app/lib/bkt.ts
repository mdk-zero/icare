import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistRating } from './task-ratings';

/**
 * Bayesian Knowledge Tracing: a student's probability of knowing a skill,
 * traced over their answers on it. An answer is a quiz answer, or a skill's
 * rating on a finished Patient Case or Return Demonstration (ratingAsAnswer).
 * The ML service fits the four parameters per Taylor's skill (ml/app/bkt.py,
 * migration 084); this file applies the same update rules, so a review quiz can
 * estimate mastery from the answers up to this moment, including a review
 * finished a minute ago.
 *
 *   p_init   P(L0)  the student already knows the skill
 *   p_learn  P(T)   they learn it after an answer
 *   p_guess  P(G)   they answer right without knowing it
 *   p_slip   P(S)   they answer wrong despite knowing it
 */

export interface BktParams {
  p_init: number;
  p_learn: number;
  p_guess: number;
  p_slip: number;
}

/**
 * Cold start: what a skill uses until the ML service has fitted it (or
 * before 084). Keep in step with the DEFAULT_P_* constants in ml/app/bkt.py.
 */
export const DEFAULT_BKT: BktParams = { p_init: 0.3, p_learn: 0.1, p_guess: 0.2, p_slip: 0.1 };

/** P(known) at which a skill counts as mastered, the usual BKT cutoff. */
export const MASTERY_THRESHOLD = 0.95;

/**
 * What a skill needs for a fit of its own, for the notes that explain a default.
 * Keep in step with MIN_FIT_STUDENTS and MIN_FIT_ANSWERS in ml/app/bkt.py.
 */
export const MIN_FIT_STUDENTS = 5;
export const MIN_FIT_ANSWERS = 40;

/** Where a skill's parameters came from: its own fit, its chapter's, or the cold start. */
export type BktSource = 'fitted' | 'chapter' | 'default';

export interface BktFit extends BktParams {
  source: BktSource;
}

/** One student's estimate on one skill. */
export interface SkillMastery {
  skill_id: string;
  title: string;
  /** P(known) after the student's last answer, 0 to 1. */
  mastery: number;
  /** Quiz answers and rated Patient Case or Return Demonstration tasks on the skill. */
  answers: number;
  /** Of those, the right answers and the Excellent or Satisfactory ratings. */
  correct: number;
  source: BktSource;
}

/** One answer on a skill, placed on the timeline the trace reads. */
export interface SkillAnswer {
  student_id: string;
  skill_id: string;
  at: string;
  correct: boolean;
}

/** One skill across the students who have answered on it. */
export interface CohortSkillMastery {
  skill_id: string;
  title: string;
  /** The mean of those students' P(known), 0 to 1. */
  average_mastery: number;
  students: number;
  mastered: number;
  answers: number;
  source: BktSource;
}

export interface CohortMastery {
  /** Weakest first. */
  skills: CohortSkillMastery[];
  /** Students in scope with at least one answer on a skill. */
  students_traced: number;
  total_students: number;
  answers: number;
}

/** How many skills in the list rest on each source. */
export function countSources(skills: readonly { source: BktSource }[]): Record<BktSource, number> {
  const counts: Record<BktSource, number> = { fitted: 0, chapter: 0, default: 0 };
  for (const skill of skills) counts[skill.source] += 1;
  return counts;
}

/** The per-student estimates rolled up per skill, weakest first. */
export function summariseCohort(byStudent: ReadonlyMap<string, readonly SkillMastery[]>, totalStudents: number): CohortMastery {
  const skills = new Map<string, CohortSkillMastery & { sum: number }>();
  let answers = 0;
  for (const estimates of byStudent.values()) {
    for (const e of estimates) {
      answers += e.answers;
      const row = skills.get(e.skill_id) ?? {
        skill_id: e.skill_id,
        title: e.title,
        average_mastery: 0,
        students: 0,
        mastered: 0,
        answers: 0,
        source: e.source,
        sum: 0,
      };
      row.sum += e.mastery;
      row.students += 1;
      row.answers += e.answers;
      if (e.mastery >= MASTERY_THRESHOLD) row.mastered += 1;
      skills.set(e.skill_id, row);
    }
  }
  return {
    skills: [...skills.values()]
      .map(({ sum, ...row }) => ({ ...row, average_mastery: sum / row.students }))
      .sort((a, b) => a.average_mastery - b.average_mastery || a.skill_id.localeCompare(b.skill_id)),
    students_traced: [...byStudent.values()].filter((estimates) => estimates.length > 0).length,
    total_students: totalStudents,
    answers,
  };
}

/** P(the next answer is right) given P(the skill is known). */
export function predictCorrect(pKnown: number, params: BktParams): number {
  return pKnown * (1 - params.p_slip) + (1 - pKnown) * params.p_guess;
}

/** Bayes on the observed answer, then the chance of learning from it. */
export function updateMastery(pKnown: number, correct: boolean, params: BktParams): number {
  const posterior = correct
    ? (pKnown * (1 - params.p_slip)) / (pKnown * (1 - params.p_slip) + (1 - pKnown) * params.p_guess)
    : (pKnown * params.p_slip) / (pKnown * params.p_slip + (1 - pKnown) * (1 - params.p_guess));
  return posterior + (1 - posterior) * params.p_learn;
}

/** P(known) after the answers, oldest first; p_init when there are none. */
export function traceMastery(params: BktParams, answers: readonly boolean[]): number {
  return answers.reduce((pKnown, correct) => updateMastery(pKnown, correct, params), params.p_init);
}

/**
 * A skill's rating as an answer: Excellent and Satisfactory are right, Needs
 * Practice is wrong. Null when it says nothing about the skill: N/A, or a
 * check-off nobody rated. Keep in step with RATING_ANSWERS in ml/app/bkt.py.
 */
export function ratingAsAnswer(rating: ChecklistRating | 'absent' | null): boolean | null {
  if (rating === 'excellent' || rating === 'satisfactory') return true;
  return rating === 'needs_practice' ? false : null;
}

/** Quiz answers and ratings on one timeline; those of one moment keep their order, so a paper stays in paper order. */
export function oldestFirst<T extends { at: string }>(answers: readonly T[]): T[] {
  return [...answers].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Oldest first: runs by when they were handed in, answers by their place on the paper. */
export function answersInOrder<T extends { attempt_id: string; question_id: string }>(
  answers: readonly T[],
  attempts: readonly { id: string; submitted_at: string | null }[],
  served: readonly { attempt_id: string; question_id: string; position: number }[],
): T[] {
  const submittedAt = new Map(attempts.map((a) => [a.id, a.submitted_at ?? '']));
  const slot = new Map(served.map((r) => [`${r.attempt_id}:${r.question_id}`, r.position]));
  return [...answers].sort(
    (a, b) =>
      (submittedAt.get(a.attempt_id) ?? '').localeCompare(submittedAt.get(b.attempt_id) ?? '') ||
      a.attempt_id.localeCompare(b.attempt_id) ||
      (slot.get(`${a.attempt_id}:${a.question_id}`) ?? 0) - (slot.get(`${b.attempt_id}:${b.question_id}`) ?? 0),
  );
}

/** Before 084 the table is missing: 42P01 from Postgres, PGRST205 from PostgREST. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** The fitted parameters for the given skills; a skill not in the map uses DEFAULT_BKT. */
export async function loadBktParameters(
  supabase: SupabaseClient,
  skillIds: readonly string[],
): Promise<Map<string, BktFit>> {
  const params = new Map<string, BktFit>();
  if (skillIds.length === 0) return params;
  const { data, error } = await supabase
    .from('bkt_parameters')
    .select('skill_id, p_init, p_learn, p_guess, p_slip, source')
    .in('skill_id', [...new Set(skillIds)]);
  if (error) {
    if (!isMissingTable(error)) console.error('Failed to read BKT parameters; using defaults', error);
    return params;
  }
  for (const row of data ?? []) {
    params.set(row.skill_id as string, {
      p_init: Number(row.p_init),
      p_learn: Number(row.p_learn),
      p_guess: Number(row.p_guess),
      p_slip: Number(row.p_slip),
      source: row.source as BktSource,
    });
  }
  return params;
}
