/**
 * A case presentation is about a real hospital patient, so the patient is
 * named by initials only — "Juan Dela Cruz" becomes "JD". The server and the
 * database enforce the same pattern.
 *
 * Keep in sync with web/app/lib/case-privacy.ts.
 */
export const INITIALS_PATTERN = /^[A-Z]{2,4}$/;

/** "j.d." / "j d" / "jd" → "JD"; null when what's left can't be initials. */
export function normalizeInitials(raw: string): string | null {
  const letters = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return INITIALS_PATTERN.test(letters) ? letters : null;
}

/** What the initials box accepts while typing: letters only, capitalised, at most four. */
export function filterInitialsInput(raw: string): string {
  return raw.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4);
}
