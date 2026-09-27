/**
 * Slack given past a timed assessment's limit before a submission counts as
 * late: the mobile app submits when its timer hits zero, and the request still
 * has to cross a campus network.
 */
export const LATE_GRACE_SECONDS = 60;

/**
 * Whether an attempt was submitted after its time limit. Late attempts are
 * still graded and counted (status stays 'submitted', which every report,
 * analytic and ML feature keys on); lateness is read from time_taken_seconds.
 */
export function isLateSubmission(
  timeTakenSeconds: number | null | undefined,
  timeLimitSeconds: number | null | undefined,
): boolean {
  if (!timeLimitSeconds || timeTakenSeconds === null || timeTakenSeconds === undefined) return false;
  return timeTakenSeconds > timeLimitSeconds + LATE_GRACE_SECONDS;
}
