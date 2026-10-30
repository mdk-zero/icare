import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Practice runs past a quiz's attempt limit (migration 083).
 *
 * The instructor's limit buys graded tries; the best of those is the grade.
 * Once they are used up a student can keep taking the quiz as practice: the
 * paper is still dealt by the adaptive selection, and its results steer the
 * next one, but a finished practice run is stored as 'practiced' rather than
 * 'submitted'. Every grade, average, report and warehouse function reads
 * 'submitted' only, so practice never moves any of them.
 *
 * Whether a run is practice is decided by the same rule when it is dealt and
 * again when it closes, so an instructor granting another try mid-run turns
 * that run into a graded one.
 */

/** A finished practice run. Graded readers never see it. */
export const PRACTICE_STATUS = 'practiced';

/** Graded tries that have run their course; the limit counts these. */
export const GRADED_SPENT_STATUSES = ['submitted', 'expired'];

/** With the graded tries used up, the next run is practice. Unlimited never is. */
export function isPracticeRun(spent: number, maxAttempts: number | null): boolean {
  return maxAttempts !== null && spent >= maxAttempts;
}

export interface AttemptLimit {
  assignment: { id: string; status: string; max_attempts: number | null } | null;
  /** A per-student override beats the quiz default; null at both levels is unlimited. */
  maxAttempts: number | null;
  /** Graded tries used. */
  spent: number;
}

/** The student's limit on a quiz and the graded tries they have used against it. */
export async function loadAttemptLimit(
  supabase: SupabaseClient,
  options: {
    assessmentId: string;
    studentId: string;
    quizMaxAttempts: number | null;
    /** The attempt being closed, which must not count against itself. */
    excludeAttemptId?: string;
  },
): Promise<AttemptLimit> {
  const { assessmentId, studentId, quizMaxAttempts, excludeAttemptId } = options;
  let spentQuery = supabase
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .eq('student_id', studentId)
    .in('status', GRADED_SPENT_STATUSES);
  if (excludeAttemptId) spentQuery = spentQuery.neq('id', excludeAttemptId);

  const [{ data: assignment }, { count }] = await Promise.all([
    supabase
      .from('assessment_assignments')
      .select('id, status, max_attempts')
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId)
      .maybeSingle(),
    spentQuery,
  ]);

  return {
    assignment: assignment ?? null,
    maxAttempts: assignment?.max_attempts ?? quizMaxAttempts ?? null,
    spent: count ?? 0,
  };
}

const NEGATIVE_PROBE_TTL_MS = 5 * 60 * 1000;
let practiceKnownLive = false;
let lastNegativeProbe = 0;

/**
 * Whether 083 is applied. Before it, 'practiced' is not a valid status and
 * writing one fails, so the quiz stays closed at the limit as it always was.
 * A yes is kept for the life of the process; a no is asked again after a few
 * minutes, so applying the migration takes effect without a redeploy.
 */
export async function practiceLive(supabase: SupabaseClient): Promise<boolean> {
  if (practiceKnownLive) return true;
  if (Date.now() - lastNegativeProbe < NEGATIVE_PROBE_TTL_MS) return false;

  // A GET rather than a head request: only a body carries the error code.
  const { error } = await supabase
    .from('assessment_attempts')
    .select('id')
    .eq('status', PRACTICE_STATUS)
    .limit(1);
  if (!error) {
    practiceKnownLive = true;
    return true;
  }
  // 22P02: invalid input value for enum attempt_status. Anything else is a
  // passing failure, so it isn't remembered.
  if (error.code === '22P02') lastNegativeProbe = Date.now();
  else console.error('Probing for practice runs failed', error);
  return false;
}

/**
 * Finished runs with a score, graded or not: what adaptive selection and
 * flashcards learn from. Before 083, naming 'practiced' in a filter would fail
 * the whole query, so it is only named once the status exists.
 */
export async function scoredStatuses(supabase: SupabaseClient): Promise<string[]> {
  return (await practiceLive(supabase)) ? ['submitted', PRACTICE_STATUS] : ['submitted'];
}
