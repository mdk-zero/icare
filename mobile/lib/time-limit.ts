/**
 * A patient case's or Return Demonstration's time limit (098), as the student
 * sees it: minutes from Start, counting down. Finishing past it still counts,
 * but adds less to their skill mastery. Keep timeLimitLabel in step with
 * web/app/lib/activity-time.ts.
 */

/** "45 min", "1 hr", "1 hr 30 min". */
export function timeLimitLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** "mm:ss", or "h:mm:ss" from an hour. */
export function clockLabel(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

/**
 * Seconds left of the limit given the seconds elapsed since Start: negative
 * once it has run out. Null when there is no limit or the clock isn't running.
 */
export function secondsLeft(timeLimitMinutes: number | null | undefined, elapsed: number | null): number | null {
  if (!timeLimitMinutes || elapsed === null) return null;
  return timeLimitMinutes * 60 - elapsed;
}
