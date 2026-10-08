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
