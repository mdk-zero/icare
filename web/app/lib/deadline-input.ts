import type { Parsed } from './course-progress';

/**
 * A deadline as typed into a form, read in the instructor's own time zone.
 * Deadlines decide attendance, so a bare date ("2026-10-10") means the end
 * of that day, not midnight UTC, and a date and time means that local time.
 * Converted in the browser, where the time zone is the instructor's: the
 * server runs in UTC.
 */
export function deadlineFromInput(value: string): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const local = date
    ? new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 23, 59)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)
      ? new Date(value)
      : null;
  return local && !Number.isNaN(local.getTime()) ? local.toISOString() : null;
}

/**
 * A deadline as an API request carries it: an ISO timestamp the form already
 * converted. Every activity needs one, so a missing deadline is refused,
 * unless optional (a quiz whose assessment has its own deadline).
 */
export function parseDeadline(value: unknown, opts: { optional?: boolean } = {}): Parsed<string | null> {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return opts.optional ? { ok: true, value: null } : { ok: false, error: 'Set a deadline' };
  }
  const at = typeof value === 'string' ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return { ok: false, error: 'Invalid deadline' };
  return { ok: true, value: at.toISOString() };
}
