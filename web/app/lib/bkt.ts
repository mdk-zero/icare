import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bayesian Knowledge Tracing: a student's probability of knowing a skill,
 * traced over their answers on it. The ML service fits the four parameters
 * per Taylor's skill (ml/app/bkt.py, migration 084); this file applies the
 * same update rules, so the adaptive quiz review can estimate mastery from
 * the answers up to this moment, including a practice run finished a minute
 * ago.
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

/** Before 084 the table is missing: 42P01 from Postgres, PGRST205 from PostgREST. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** The fitted parameters for the given skills; a skill not in the map uses DEFAULT_BKT. */
export async function loadBktParameters(
  supabase: SupabaseClient,
  skillIds: readonly string[],
): Promise<Map<string, BktParams>> {
  const params = new Map<string, BktParams>();
  if (skillIds.length === 0) return params;
  const { data, error } = await supabase
    .from('bkt_parameters')
    .select('skill_id, p_init, p_learn, p_guess, p_slip')
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
    });
  }
  return params;
}
