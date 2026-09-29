import { NextRequest, NextResponse } from 'next/server';
import { findPendingAccessRequest } from '@/app/lib/access-requests';
import { sendAccessRequestEmail } from '@/app/lib/auth/email';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { DEV_TEAM_EMAILS } from '@/app/lib/dev-team';

const MAX_MESSAGE = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A nudge on an account request nobody has handled yet. Each super admin gets
 * a fresh copy of the request carrying the follow-up, so it surfaces as new
 * and unread; it shares the original's request_id, so accepting or declining
 * either one settles both.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!email || !message) {
    return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 400 });
  }

  const pending = await findPendingAccessRequest(email);
  if (!pending) {
    return NextResponse.json(
      { error: 'There is no pending request for this email. Send a new request instead.' },
      { status: 404 },
    );
  }

  // One follow-up per request a day, plus a per-IP cap so the form can't be
  // used to flood the admins' feed across many requests.
  if (!(await consumeRateLimit(`contact-follow-up-ip:${clientIp(request)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  if (!(await consumeRateLimit(`contact-follow-up:${pending.request_id}`, 1, DAY_MS))) {
    return NextResponse.json(
      {
        code: 'follow_up_limit',
        error: "You've already sent a follow-up today. Please give the team a little time.",
      },
      { status: 429 },
    );
  }

  const supabase = getSupabaseAdmin();
  let notified = false;
  try {
    const { data: admins, error } = await supabase.from('users').select('id').eq('role', 'super_admin');
    if (error) throw error;
    if (admins?.length) {
      const { error: insertError } = await supabase.from('notifications').insert(
        admins.map((admin) => ({
          user_id: admin.id,
          type: 'system' as const,
          title: `Follow-up on ${pending.name}'s account request`,
          body: `${pending.email}: ${message}`,
          data: { ...pending, follow_up: true, follow_up_message: message },
        })),
      );
      if (insertError) throw insertError;
      notified = true;
    }
  } catch (err) {
    console.error('Failed to notify super admins of follow-up', err);
  }

  const mailed = await sendAccessRequestEmail(DEV_TEAM_EMAILS, {
    name: pending.name,
    email: pending.email,
    sex: pending.sex,
    subject: `Follow-up: ${pending.subject}`,
    message,
  }).then(
    () => true,
    (err) => {
      console.error('Follow-up email failed', err);
      return false;
    },
  );

  if (!notified && !mailed) {
    return NextResponse.json(
      { error: 'Your follow-up could not be sent. Please try again later.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
