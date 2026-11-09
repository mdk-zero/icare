import { after } from 'next/server';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNotificationCopies } from './auth/email';
import { emailCopyRecipients } from './student-web-server';
import { STUDENT_WEB_PATH } from './student-web';

/** A notification row to write; the database fills in the rest. */
export interface NewNotification {
  user_id: string;
  type?: string;
  title: string;
  body?: string;
  data?: object;
}

/**
 * Writes notification rows: the one way the app notifies anyone. Each shows
 * in the person's bell at once (the live feed), and the 072 trigger pushes it
 * to their phone. Browsers get no push, so while the student web app is on,
 * students who use it get each one by email as well (lib/student-web).
 *
 * `emailCopies: false` for a notification whose news already went out by
 * email, so nobody gets it twice. The result is the insert's own, so callers
 * read `error` as before.
 */
export async function insertNotifications(
  supabase: SupabaseClient,
  rows: NewNotification | NewNotification[],
  { emailCopies = true }: { emailCopies?: boolean } = {},
) {
  const list = Array.isArray(rows) ? rows : [rows];
  const result = await supabase.from('notifications').insert(list);
  if (!result.error && emailCopies && list.length > 0) emailCopiesAfterResponse(list);
  return result;
}

/** After the response, so a notification never waits on an email. */
function emailCopiesAfterResponse(rows: NewNotification[]) {
  const run = async () => {
    try {
      const recipients = await emailCopyRecipients(rows.map((r) => r.user_id));
      if (recipients.length === 0) return;
      const byId = new Map(recipients.map((r) => [r.id, r]));
      const copies = rows.flatMap((row) => {
        const to = byId.get(row.user_id);
        return to ? [{ email: to.email, name: to.name, title: row.title, body: row.body ?? '' }] : [];
      });
      const result = await sendNotificationCopies(copies, `${await siteOrigin()}${STUDENT_WEB_PATH}/notifications`);
      if (result.error) console.error('Some notification emails were refused', result.error);
    } catch (err) {
      console.error('Emailing notification copies failed', err);
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (a script): nothing to wait for, so send now.
    void run();
  }
}

/** This site's address, from the request being answered. */
async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  } catch {
    // No request in scope.
  }
  return 'https://www.i-care.dev';
}
