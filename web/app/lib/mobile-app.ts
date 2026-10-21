/**
 * Where students get the Android app. MOBILE_APP_URL holds the APK itself (an
 * EAS build artifact today), but everything handed out -- the portals' link,
 * the welcome and app-link emails -- points at /download on this site, which
 * redirects there. A new APK then means changing the variable, and the links
 * in emails already sent keep working.
 *
 * Server-only: MOBILE_APP_URL is not a public variable, so in a browser this
 * always reads as unset.
 */
export const APP_DOWNLOAD_PATH = '/download';

/** The APK itself, from MOBILE_APP_URL (https only), or null when it isn't set. */
export function mobileAppTarget(): string | null {
  const url = process.env.MOBILE_APP_URL?.trim();
  return url && url.startsWith('https://') ? url : null;
}

/** The download link to hand out on this site, or null while there is no app to link. */
export function appDownloadUrl(origin: string): string | null {
  return mobileAppTarget() ? `${origin}${APP_DOWNLOAD_PATH}` : null;
}
