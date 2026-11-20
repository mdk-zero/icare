/**
 * An activity's time limit (098): the minutes a student has once they start a
 * patient case or Return Demonstration. The student sees it count down, and a
 * try finished past it counts for less in skill mastery. Shared by the server,
 * the portal and the app, so nothing here touches the database.
 */

export const MAX_TIME_LIMIT_MINUTES = 240;

/**
 * A time limit from a request body: a whole number of minutes from 1 to 240,
 * or null (or "" / 0) for none. `undefined` when the field was left out.
 */
export function parseActivityTimeLimit(value: unknown): { value: number | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null || value === '' || value === 0) return { value: null };
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIME_LIMIT_MINUTES) {
    return { error: `The time limit must be a whole number of minutes from 1 to ${MAX_TIME_LIMIT_MINUTES}` };
  }
  return { value: minutes };
}

/** Whether a finished try went past its time limit. False when either side is unknown. */
export function wentOverTime(
  timeLimitMinutes: number | null | undefined,
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): boolean {
  if (!timeLimitMinutes || !startedAt || !finishedAt) return false;
  const took = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(took) && took > timeLimitMinutes * 60_000;
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function timeLimitLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
