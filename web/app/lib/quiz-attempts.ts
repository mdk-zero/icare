/**
 * How many times a student may sit a quiz. Every quiz allows a retake: two
 * attempts is the standard, and a quiz can allow more but never fewer.
 */
export const DEFAULT_ATTEMPTS = 2;
export const MIN_ATTEMPTS = 2;

/** A whole number of attempts no lower than the minimum. */
export function isValidAttempts(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_ATTEMPTS;
}
