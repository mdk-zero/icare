/**
 * The student web app: this app built for browsers (scripts/publish-web.mjs)
 * and served by the web portal at /student. An Admin turns it on and off; the
 * server's side is web/app/lib/student-web.ts. On the phone none of this runs.
 *
 * Browsers get no push notifications, so on the web a student's notifications
 * come by email instead, with their own switch in Settings.
 */

import { Platform } from 'react-native';
import { api, isNetworkError } from './client';

export const isStudentWeb = Platform.OS === 'web';

/**
 * Whether an Admin has the web version on. Unknown (offline, a server error)
 * counts as on: the sign-in that follows gets the real answer, and a blip
 * shouldn't lock a student out of their cached work.
 */
export async function studentWebOn(): Promise<boolean> {
  try {
    const { on } = await api<{ on: boolean }>('/api/student-web', { auth: false });
    return on;
  } catch (err) {
    if (!isNetworkError(err)) console.warn('Checking the web version failed', err);
    return true;
  }
}

/** Whether this student gets their notifications by email. */
export async function emailNotificationsOn(): Promise<boolean> {
  const { on } = await api<{ on: boolean }>('/api/student-web/email');
  return on;
}

export async function setEmailNotifications(on: boolean): Promise<boolean> {
  const result = await api<{ on: boolean }>('/api/student-web/email', { method: 'POST', body: { on } });
  return result.on;
}
