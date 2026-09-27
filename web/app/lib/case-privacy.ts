/**
 * A case presentation is about a real hospital patient, so the patient is
 * named by initials only — "Juan Dela Cruz" becomes "JD". Migration 056
 * enforces the same pattern as a check constraint.
 *
 * Keep in sync with mobile/lib/case-privacy.ts.
 */
export const INITIALS_PATTERN = /^[A-Z]{2,4}$/;

/** "j.d." / "j d" / "jd" → "JD"; null when what's left can't be initials. */
export function normalizeInitials(raw: string): string | null {
  const letters = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return INITIALS_PATTERN.test(letters) ? letters : null;
}
