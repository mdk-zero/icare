/**
 * A quiz's time limit as instructors type it: "MM:SS" minutes and seconds,
 * shown as "00:00 min". Empty or 00:00 means no limit. A bare number is
 * whole minutes ("5" is 05:00).
 */

/** Seconds, null for no limit, or 'invalid' for text that isn't a time. */
export function parseTimeLimit(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(t);
  if (!m) return 'invalid';
  const minutes = Number(m[1]);
  const seconds = m[2] === undefined ? 0 : Number(m[2]);
  if (seconds > 59) return 'invalid';
  const total = minutes * 60 + seconds;
  return total === 0 ? null : total;
}

/** "MM:SS" for a limit in seconds; empty for no limit. */
export function formatTimeLimit(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** The same limit as people read it: "15 min", "1 min 30 s", "No time limit". */
export function describeTimeLimit(seconds: number | null | undefined): string {
  if (!seconds) return 'No time limit';
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  if (!ss) return `${mm} min`;
  return mm ? `${mm} min ${ss} s` : `${ss} s`;
}
