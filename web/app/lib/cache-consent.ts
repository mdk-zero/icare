export type CacheConsent = "granted" | "declined";

export const CACHE_CONSENT_STORAGE_KEY = "icare_cache_consent";

/** Same-tab preference changes; `storage` only fires in *other* tabs. */
export const CACHE_CONSENT_CHANGE_EVENT = "icare:cacheconsentchange";

function isCacheConsent(value: unknown): value is CacheConsent {
  return value === "granted" || value === "declined";
}

/** `null` means the person has never been asked. */
export function getCacheConsent(): CacheConsent | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CACHE_CONSENT_STORAGE_KEY);
  return isCacheConsent(stored) ? stored : null;
}

export function setCacheConsent(consent: CacheConsent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_CONSENT_STORAGE_KEY, consent);
  window.dispatchEvent(new CustomEvent(CACHE_CONSENT_CHANGE_EVENT, { detail: consent }));
}
