/**
 * Whether a Return Demonstration's grade shows the student can do it. The
 * College's passing mark for skill assessments is 75% (see PASSING_SCORE in
 * reports/data.ts), and a Return Demonstration is held to the same mark.
 *
 * This only reads the grade the instructor already gave. It is not part of
 * skill mastery (Bayesian Knowledge Tracing), which is built on Taylor's
 * skills; a school's own checklist, such as the EINC, is recorded in the grades.
 */
export const COMPETENT_AT = 75;

export const COMPETENT = 'Competent';
export const NOT_YET_COMPETENT = 'Not yet competent';

/** "Competent" at 75% and up, "Not yet competent" below it, a dash until graded. */
export function competencyRemark(score: number | null): string {
  if (score === null) return '—';
  return score >= COMPETENT_AT ? COMPETENT : NOT_YET_COMPETENT;
}
