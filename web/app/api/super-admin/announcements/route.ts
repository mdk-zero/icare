import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { sendAnnouncementEmails } from '@/app/lib/auth/email';
import { logAudit } from '@/app/lib/audit';
import { CONTACT_EMAIL } from '@/app/lib/dev-team';
import { fetchAll } from '@/app/lib/fetch-all';
import {
  ANNOUNCEMENT_ACTION,
  ANNOUNCEMENT_MESSAGE_LIMIT,
  ANNOUNCEMENT_TITLE_LIMIT,
  announcementData,
  describeAudience,
  inAudience,
  parseAudience,
  toAnnouncementSummary,
  type AnnouncementSummary,
} from '@/app/lib/announcements';
import { insertNotifications } from '@/app/lib/notify';

// A send to everyone writes a notification per account and emails each one.
export const maxDuration = 60;

const HISTORY_LIMIT = 30;
const INSERT_CHUNK = 500;

/** The latest announcements, newest first, each with how many people have opened it. */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('entity_id, created_at, details')
      .eq('action', ANNOUNCEMENT_ACTION)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) throw error;

    const sent = (data ?? []).map(toAnnouncementSummary).filter((a) => a !== null);
    const announcements: AnnouncementSummary[] = await Promise.all(
      sent.map(async (a) => {
        const { count, error: countError } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('data->>announcement_id', a.id)
          .not('read_at', 'is', null);
        return { ...a, read: countError ? null : (count ?? 0) };
      }),
    );
    return NextResponse.json({ announcements });
  } catch (err) {
    console.error('GET /api/super-admin/announcements failed', err);
    return NextResponse.json({ error: 'Unable to load announcements' }, { status: 500 });
  }
}

type Recipient = { id: string; name: string; email: string; role: string };

/**
 * POST { title, message, audience, email }: sends an announcement. Every
 * account in the audience gets a notification (and a push on their phone);
 * with `email` each also gets their own email, replies going to the contact
 * inbox. The notifications go first: if they can't be written, nothing is
 * emailed either.
 */
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!title) return NextResponse.json({ error: 'Give the announcement a title.' }, { status: 400 });
  if (title.length > ANNOUNCEMENT_TITLE_LIMIT) {
    return NextResponse.json({ error: `Keep the title under ${ANNOUNCEMENT_TITLE_LIMIT} characters.` }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: 'Write the message first.' }, { status: 400 });
  if (message.length > ANNOUNCEMENT_MESSAGE_LIMIT) {
    return NextResponse.json({ error: `Keep the message under ${ANNOUNCEMENT_MESSAGE_LIMIT} characters.` }, { status: 400 });
  }
  const parsed = parseAudience(body.audience);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { audience } = parsed;
  const withEmail = body.email === true;

  try {
    const supabase = getSupabaseAdmin();
    const [accounts, { data: me }] = await Promise.all([
      fetchAll<Recipient>((from, to) =>
        supabase.from('users').select('id, name, email, role').order('id').range(from, to),
      ),
      supabase.from('users').select('name').eq('id', session.uid).maybeSingle(),
    ]);
    const recipients = accounts.filter((u) => inAudience(audience, u));
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Nobody matches who you picked.' }, { status: 400 });
    }
    const adminName = (me?.name as string | undefined) ?? session.email;

    const id = randomUUID();
    const data = announcementData(id, adminName);
    let notified = 0;
    for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
      const rows = recipients
        .slice(i, i + INSERT_CHUNK)
        .map((r) => ({ user_id: r.id, type: 'system', title, body: message, data }));
      // Emailed below when the Admin asked; otherwise web students get the usual copy.
      const { error } = await insertNotifications(supabase, rows, { emailCopies: !withEmail });
      if (error) {
        console.error('Announcement: notifications insert failed', error);
        if (notified === 0) {
          return NextResponse.json({ error: 'The announcement could not be sent. Nothing went out.' }, { status: 500 });
        }
        break;
      }
      notified += rows.length;
    }

    // Only the people who got the notification are emailed, so the two agree.
    let emailed: number | null = null;
    let emailError: string | undefined;
    if (withEmail) {
      const reached = recipients
        .slice(0, notified)
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email ?? ''));
      const result = await sendAnnouncementEmails(reached, {
        title,
        message,
        adminName,
        replyTo: CONTACT_EMAIL,
      });
      emailed = result.sent;
      emailError = result.error;
      if (emailError) console.error('Announcement: some emails were refused', emailError);
    }

    const audienceLabel = describeAudience(audience);
    const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
    await logAudit(
      session,
      {
        action: ANNOUNCEMENT_ACTION,
        entityType: 'notifications',
        entityId: id,
        details: {
          message:
            `Sent the announcement "${title}" to ${people(notified)} (${audienceLabel})` +
            (emailed !== null ? `, emailed to ${emailed}` : ''),
          title,
          text: message,
          audience: audienceLabel,
          audience_kind: audience.kind,
          recipients: notified,
          email: withEmail,
          emailed,
          by_name: adminName,
        },
      },
      request,
    );

    return NextResponse.json({
      id,
      recipients: recipients.length,
      notified,
      emailed,
      ...(emailError ? { email_error: emailError } : {}),
    });
  } catch (err) {
    console.error('POST /api/super-admin/announcements failed', err);
    return NextResponse.json({ error: 'Unable to send the announcement' }, { status: 500 });
  }
}
