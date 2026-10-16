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
