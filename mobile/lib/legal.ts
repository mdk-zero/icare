/**
 * The Terms of Use and Privacy Policy open on the app's own screen
 * (app/legal/[doc].tsx), never in a browser.
 */

import { router } from 'expo-router';

export function openTerms() {
  router.push('/legal/terms');
}

export function openPrivacy() {
  router.push('/legal/privacy');
}
