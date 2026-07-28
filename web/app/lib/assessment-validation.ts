import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What stops an assessment being published.
 *
 * Publishing used to require only that a question existed. Selection now makes
 * promises a half-configured assessment cannot keep: a fixed paper size, every
 * criterion represented, and every question owned by a criterion. Each of those
 * fails silently at attempt time rather than loudly — a criterion with no
 * questions scores a permanent 0% and quietly drags its weight through the
 * whole cohort's results — so they are checked once, here, at the point the
 * assessment becomes visible to students.
 *
 * Returns every problem rather than the first, so the editor can show a list to
 * work through instead of one error at a time.
 */

export interface PublishBlocker {
  code:
    | 'no_questions'
    | 'no_criteria'
    | 'weights'
    | 'unassigned_questions'
    | 'no_total'
    | 'total_exceeds_bank'
    | 'criterion_below_min'
    | 'minimums_exceed_total';
  message: string;
}

/** Criteria weights are a percentage split, so they have to land on 100. */
const REQUIRED_WEIGHT_TOTAL = 100;

export async function assessmentPublishBlockers(
  supabase: SupabaseClient,
  assessmentId: string,
  /**
   * Values the caller is about to write. Lets a PATCH that publishes and sets
   * the paper size in one request be judged on what the assessment is about to
   * become, without having to write anything it may then reject.
   */
  overrides?: { total_questions?: number | null },
): Promise<PublishBlocker[]> {
  const [assessmentRes, criteriaRes, questionsRes] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, total_questions')
      .eq('id', assessmentId)
      .maybeSingle(),
    supabase
      .from('assessment_criteria')
      .select('id, name, weight, min_questions')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true }),
    supabase.from('questions').select('id, criteria_id').eq('assessment_id', assessmentId),
  ]);

  const blockers: PublishBlocker[] = [];
  if (!assessmentRes.data) {
    return [{ code: 'no_questions', message: 'Assessment not found' }];
  }

  const criteria = criteriaRes.data ?? [];
  const questions = questionsRes.data ?? [];

  if (questions.length === 0) {
    // Kept verbatim: this message predates the rest and the editor matches on it.
    return [{ code: 'no_questions', message: 'Cannot publish an assessment with no questions' }];
  }

  if (criteria.length === 0) {
    blockers.push({
      code: 'no_criteria',
      message: 'Add at least one criterion before publishing — questions are organised by criterion.',
    });
    // Everything below is expressed in terms of criteria, so stop here.
    return blockers;
  }

  const weightTotal = criteria.reduce((sum, c) => sum + Number(c.weight), 0);
  if (Math.round(weightTotal * 100) / 100 !== REQUIRED_WEIGHT_TOTAL) {
    blockers.push({
      code: 'weights',
      message: `Criteria weights must total ${REQUIRED_WEIGHT_TOTAL}% (currently ${
        Math.round(weightTotal * 100) / 100
      }%).`,
    });
  }

  const unassigned = questions.filter((q) => !q.criteria_id);
  if (unassigned.length > 0) {
    blockers.push({
      code: 'unassigned_questions',
      message: `${unassigned.length} question${
        unassigned.length === 1 ? ' is' : 's are'
      } not assigned to a criterion. Unassigned questions are never served.`,
    });
  }

  const poolOf = (criterionId: string) =>
    questions.filter((q) => q.criteria_id === criterionId).length;

  for (const criterion of criteria) {
    const pool = poolOf(criterion.id);
    const min = criterion.min_questions ?? 0;
    if (pool < min) {
      blockers.push({
        code: 'criterion_below_min',
        message:
          `"${criterion.name}" needs at least ${min} question${min === 1 ? '' : 's'} ` +
          `but has ${pool}.`,
      });
    }
  }

  const totalQuestions =
    overrides && 'total_questions' in overrides
      ? overrides.total_questions
      : assessmentRes.data.total_questions;
  if (totalQuestions === null || totalQuestions === undefined) {
    blockers.push({
      code: 'no_total',
      message: 'Set how many questions each attempt serves before publishing.',
    });
  } else {
    // Only questions a criterion owns can be served.
    const servable = questions.length - unassigned.length;
    if (totalQuestions > servable) {
      blockers.push({
        code: 'total_exceeds_bank',
        message:
          `Each attempt is set to serve ${totalQuestions} questions but only ${servable} ` +
          `${servable === 1 ? 'is' : 'are'} assigned to a criterion.`,
      });
    }

    const minimumTotal = criteria.reduce(
      (sum, c) => sum + Math.min(c.min_questions ?? 0, poolOf(c.id)),
      0,
    );
    if (minimumTotal > totalQuestions) {
      blockers.push({
        code: 'minimums_exceed_total',
        message:
          `Criteria minimums add up to ${minimumTotal} questions, more than the ` +
          `${totalQuestions} each attempt serves.`,
      });
    }
  }

  return blockers;
}
