/**
 * The Terms of Use and Privacy Policy live on the website (one public copy,
 * the same one App Store Connect links to) and open in the in-app browser.
 */

import * as WebBrowser from 'expo-web-browser';
import { API_URL } from './client';

export const TERMS_URL = `${API_URL}/terms`;
export const PRIVACY_URL = `${API_URL}/privacy`;

export function openTerms() {
  void WebBrowser.openBrowserAsync(TERMS_URL);
}

export function openPrivacy() {
  void WebBrowser.openBrowserAsync(PRIVACY_URL);
}
