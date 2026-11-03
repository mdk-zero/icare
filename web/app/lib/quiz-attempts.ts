/**
 * How many times a student may sit a quiz. One attempt is the standard; the
 * instructor can allow more.
 */
export const DEFAULT_ATTEMPTS = 1;
export const MIN_ATTEMPTS = 1;

/** A whole number of attempts no lower than the minimum. */
export function isValidAttempts(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_ATTEMPTS;
}

/**
 * A student's graded tries on a quiz: their own override, else the quiz's. A
 * quiz with neither (seeded, or from before limits) gets the standard, because
 * nothing else can set "unlimited" and a quiz without a limit never reaches its
 * review.
 */
export function attemptLimit(override: number | null | undefined, quizLimit: number | null | undefined): number {
  return override ?? quizLimit ?? DEFAULT_ATTEMPTS;
}

/**
 * A quiz's grade: the average of the student's graded tries, kept to two
 * decimals like a stored score. A try that timed out has no score, so it stays
 * out of the average. Null until a try has been scored.
 */
export function quizGrade(scores: readonly (number | null | undefined)[]): number | null {
  const real = scores.filter((s) => s !== null && s !== undefined).map(Number);
  if (real.length === 0) return null;
  return Math.round((real.reduce((sum, s) => sum + s, 0) / real.length) * 100) / 100;
}
