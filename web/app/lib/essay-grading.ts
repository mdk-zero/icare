import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveCompetencyScoresForAttempt } from './competency';
import { refreshStudentInBackground } from './ml';
import {
  essayCountsCorrect,
  isEssay,
  paperPoints,
  scoreCriteria,
  scorePaper,
  type CriterionRef,
  type PaperItem,
} from './essay';

/** 42P01 / PGRST205: essay_answers isn't there yet (before 097). */
export const isMissingEssayTable = (error: { code?: string } | null | undefined) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

/** 42703 / PGRST204: assessment_attempts.awaiting_grading isn't there yet (before 097). */
export const isMissingAwaitingColumn = (error: { code?: string; message?: string } | null | undefined) =>
  (error?.code === '42703' || error?.code === 'PGRST204') && /awaiting_grading/.test(error?.message ?? '');

export const ESSAYS_NEED_MIGRATION = 'Essay questions need database migration 097.';

/** 23514 on the question type: the database doesn't know essays yet (before 097). */
export const isEssayTypeRefused = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === '23514' && /question_type/.test(error?.message ?? '');

export interface EssayAnswerRow {
  id: string;
  attempt_id: string;
  question_id: string;
  answer_text: string;
  max_points: number;
  points_awarded: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
}

export const ESSAY_ANSWER_COLUMNS =
  'id, attempt_id, question_id, answer_text, max_points, points_awarded, feedback, graded_by, graded_at';

/**
 * Score an attempt again from what is stored: the paper it was served, its
 * checked answers and its essays as graded so far. Ungraded essays count 0
 * and keep the attempt awaiting grading. Each graded essay gets its
 * attempt_answers row, so mastery and the ML read it like any answer.
 *
 * Once nothing is left to grade on a graded try, the skill-area scores are
 * derived again and the ML re-scores the student. Returns the new score, or
 * null when the attempt isn't there.
 */
export async function regradeAttempt(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<{ score: number; awaiting: boolean; studentId: string; assessmentId: string } | null> {
  const { data: attempt } = await supabase
    .from('assessment_attempts')
    .select('id, assessment_id, student_id, status')
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) return null;

  const { data: servedRows } = await supabase
    .from('attempt_questions')
    .select('question_id, criteria_id, position')
    .eq('attempt_id', attemptId);
  let served = (servedRows ?? []) as { question_id: string; criteria_id: string | null }[];
  if (served.length === 0) {
    // Attempts from before papers were recorded were handed the whole bank.
    const { data: bank } = await supabase
      .from('questions')
      .select('id, criteria_id')
      .eq('assessment_id', attempt.assessment_id);
    served = (bank ?? []).map((q) => ({ question_id: q.id as string, criteria_id: q.criteria_id as string | null }));
  }
  const ids = served.map((s) => s.question_id);
  if (ids.length === 0) return null;

  const [questionsRes, answersRes, essaysRes, criteriaRes] = await Promise.all([
    supabase.from('questions').select('id, question_type, points').in('id', ids),
    supabase.from('attempt_answers').select('question_id, is_correct').eq('attempt_id', attemptId),
    supabase.from('essay_answers').select(ESSAY_ANSWER_COLUMNS).eq('attempt_id', attemptId),
    supabase
      .from('assessment_criteria')
      .select('id, name, weight, competency_id')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order', { ascending: true }),
  ]);
  if (essaysRes.error) throw essaysRes.error;

  const questionById = new Map(
    ((questionsRes.data ?? []) as { id: string; question_type: string | null; points: number | null }[]).map((q) => [q.id, q]),
  );
  const correctById = new Map(
    ((answersRes.data ?? []) as { question_id: string; is_correct: boolean }[]).map((a) => [a.question_id, a.is_correct]),
  );
  const essayById = new Map(((essaysRes.data ?? []) as EssayAnswerRow[]).map((e) => [e.question_id, e]));

  let awaiting = false;
  const items: PaperItem[] = served.map((s) => {
    const question = questionById.get(s.question_id);
    if (question && isEssay(question.question_type)) {
      const essay = essayById.get(s.question_id);
      const max = essay?.max_points ?? paperPoints(question);
      if (essay && essay.points_awarded === null) awaiting = true;
      return { question_id: s.question_id, criteria_id: s.criteria_id, max, earned: essay?.points_awarded ?? 0 };
    }
    return { question_id: s.question_id, criteria_id: s.criteria_id, max: 1, earned: correctById.get(s.question_id) ? 1 : 0 };
  });
  const score = scorePaper(items);
  const graded = attempt.status === 'submitted';

  const { error: updateError } = await supabase
    .from('assessment_attempts')
    .update({ score, awaiting_grading: awaiting })
    .eq('id', attemptId);
  if (updateError) throw updateError;

  // Graded essays read as answers everywhere else; ungraded ones not at all.
  const gradedEssays = [...essayById.values()].filter((e) => e.points_awarded !== null);
  const essayIds = [...essayById.keys()];
  if (essayIds.length > 0) {
    const { error: clearError } = await supabase
      .from('attempt_answers')
      .delete()
      .eq('attempt_id', attemptId)
      .in('question_id', essayIds);
    if (clearError) throw clearError;
  }
  if (gradedEssays.length > 0) {
    const { error: insertError } = await supabase.from('attempt_answers').insert(
      gradedEssays.map((e) => ({
        attempt_id: attemptId,
        question_id: e.question_id,
        selected_index: null,
        is_correct: essayCountsCorrect(e.points_awarded as number, e.max_points),
        answered_at: e.graded_at ?? new Date().toISOString(),
      })),
    );
    if (insertError) throw insertError;
  }

  const criteria = (criteriaRes.data ?? []) as CriterionRef[];
  if (criteria.length > 0) {
    const breakdown = scoreCriteria(items, criteria, { practice: !graded });
    await supabase.from('attempt_criteria_scores').delete().eq('attempt_id', attemptId);
    if (breakdown.length > 0) {
      const { error: criteriaError } = await supabase.from('attempt_criteria_scores').insert(
        breakdown.map((cb) => ({
          attempt_id: attemptId,
          criteria_id: cb.criteria_id,
          competency_id: criteria.find((c) => c.id === cb.criteria_id)?.competency_id ?? '',
          criteria_name: cb.criteria_name,
          weight: cb.weight,
          correct: cb.correct,
          total: cb.total,
          score: cb.score,
          weighted_score: cb.weighted_score,
        })),
      );
      if (criteriaError) console.error('Failed to save criteria scores on regrade', attemptId, criteriaError);
    }
  }

  // The skill-area standing and the ML wait for the last essay, so a
  // half-graded paper never reaches them.
  if (graded && !awaiting) {
    await supabase.from('competency_scores').delete().eq('attempt_id', attemptId).eq('source', 'assessment');
    try {
      await deriveCompetencyScoresForAttempt(supabase, attemptId);
    } catch (err) {
      console.error('Competency derivation failed on regrade', attemptId, err);
    }
    refreshStudentInBackground(attempt.student_id as string);
  }

  return { score, awaiting, studentId: attempt.student_id as string, assessmentId: attempt.assessment_id as string };
}
