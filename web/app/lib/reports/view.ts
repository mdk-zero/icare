/**
 * How a report writes dates and times. Pure, so the demo's browser-built
 * reports read the same as the server's.
 */

/**
 * The College is in the Philippines. A server's own zone is UTC on Vercel,
 * which would print the generated time eight hours behind and move a date near
 * midnight to the wrong day.
 */
export const PH_TZ = 'Asia/Manila';

/** "Nov 19, 2026", or a dash when there is no date. */
export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: PH_TZ });
}

/** "November 19, 2026 at 3:56 PM": when the report was generated. */
export function generatedStamp(now: Date): string {
  return now.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: PH_TZ });
}
