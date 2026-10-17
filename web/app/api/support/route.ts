import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { sendSupportReceipt, sendSupportRequestEmail } from '@/app/lib/auth/email';
import { consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { CONTACT_EMAIL, DEV_TEAM_EMAILS } from '@/app/lib/dev-team';
import { roleLabel } from '@/app/lib/role-labels';
import { SUPPORT_LIMITS, supportTopicLabel } from '@/app/lib/support';

const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // an hour

function text(body: Record<string, unknown>, key: keyof typeof SUPPORT_LIMITS): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Help & Support, for every signed-in role on web and mobile: mails the
 * message to the dev team with the sender's account details attached, and
 * mails the sender a copy.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? supportTopicLabel(body.topic) : null;
  const subject = text(body, 'subject');
  const message = text(body, 'message');
  const client = text(body, 'client').slice(0, SUPPORT_LIMITS.client) || null;
  if (!topic) return NextResponse.json({ error: 'Pick what this is about.' }, { status: 400 });
  if (!subject || !message) {
    return NextResponse.json({ error: 'Add a subject and a message.' }, { status: 400 });
  }
  if (subject.length > SUPPORT_LIMITS.subject || message.length > SUPPORT_LIMITS.message) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 400 });
  }

  if (!(await consumeRateLimit(`support:${session.uid}`, MAX_REQUESTS, WINDOW_MS))) {
    return NextResponse.json(
      {
        error: `You've sent several messages in the last hour. Please wait a little, or email ${CONTACT_EMAIL}.`,
      },
      { status: 429 },
    );
  }

  let name = session.email;
  let section: string | null = null;
  try {
    const { data } = await getSupabaseAdmin()
      .from('users')
      .select('name, sections!section_id(name)')
      .eq('id', session.uid)
      .maybeSingle();
    if (data?.name) name = data.name as string;
    section = (data?.sections as unknown as { name?: string } | null)?.name ?? null;
  } catch (err) {
    // The email and role from the session are enough for the team to reply.
    console.error('Support request: could not load the sender profile', err);
  }

  const supportRequest = {
    name,
    email: session.email,
    role: roleLabel(session.role),
    section,
    topic,
    subject,
    message,
    client,
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  };

  // contact@ as well, so every request also lands in the Resend Receiving
  // inbox for the domain, beside the developers' own copies.
  const recipients = [...new Set([...DEV_TEAM_EMAILS, CONTACT_EMAIL])];
  try {
    await sendSupportRequestEmail(recipients, supportRequest);
  } catch (err) {
    console.error('Support request email failed', err);
    return NextResponse.json(
      { error: `Your message could not be sent. Please try again, or email ${CONTACT_EMAIL}.` },
      { status: 500 },
    );
  }

  // The team's copy is what matters; a bounced receipt must not turn a
  // delivered message into an error the sender retries.
  try {
    await sendSupportReceipt(session.email, CONTACT_EMAIL, supportRequest);
  } catch (err) {
    console.error('Support receipt failed', err);
  }
  return NextResponse.json({ ok: true });
}
