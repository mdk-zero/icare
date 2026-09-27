import { NextRequest, NextResponse } from 'next/server';
import { sendAccessRequestEmail, sendAccessRequestReceipt } from '@/app/lib/auth/email';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

// Where access requests land: the project's own inbox on i-care.dev, which
// the registrar forwards on to the dev team. Overridable per deployment with a
// comma-separated DEV_TEAM_EMAILS.
const DEV_TEAM_EMAILS = (process.env.DEV_TEAM_EMAILS || 'contact@i-care.dev')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const MAX_REQUESTS = 3;
const WINDOW_MS = 60 * 60 * 1000; // an hour

const LIMITS = { name: 120, email: 254, subject: 150, message: 4000 };

function field(body: Record<string, unknown>, key: keyof typeof LIMITS): string | null {
  const value = body[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= LIMITS[key] ? trimmed : null;
}

type AccessRequest = { name: string; email: string; subject: string; message: string };

/**
 * Drops the request into every super admin's notification feed, since they
 * are the ones who create accounts. Returns whether at least one landed.
 */
async function notifySuperAdmins(req: AccessRequest): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'super_admin');
    if (error) throw error;
    if (!admins?.length) return false;

    const { error: insertError } = await supabase.from('notifications').insert(
      admins.map((admin) => ({
        user_id: admin.id,
        type: 'system' as const,
        title: `Account request from ${req.name}`,
        body: `${req.email} · ${req.subject}: ${req.message}`,
        data: { kind: 'access_request', name: req.name, email: req.email, subject: req.subject },
      })),
    );
    if (insertError) throw insertError;
    return true;
  } catch (err) {
    console.error('Failed to notify super admins of access request', err);
    return false;
  }
}

/**
 * Public "contact us" form: mails an account request to the dev team and
 * notifies the super admins in-app.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = field(body, 'name');
  const email = field(body, 'email');
  const subject = field(body, 'subject');
  const message = field(body, 'message');
  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Fill in every field.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!(await consumeRateLimit(`contact:${clientIp(request)}`, MAX_REQUESTS, WINDOW_MS))) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const accessRequest = { name, email, subject, message };
  const [mailed, notified] = await Promise.all([
    sendAccessRequestEmail(DEV_TEAM_EMAILS, accessRequest).then(
      () => true,
      (err) => {
        console.error('Contact request failed', err);
        return false;
      },
    ),
    notifySuperAdmins(accessRequest),
  ]);
  // Either channel reaching someone who can act on it counts as delivered;
  // failing the request then would only invite a duplicate retry.
  if (!mailed && !notified) {
    return NextResponse.json(
      { error: 'Your message could not be sent. Please try again later.' },
      { status: 500 },
    );
  }

  // The team's copy is what matters; a receipt that bounces (a typo'd address,
  // say) must not turn a delivered request into an error the person retries.
  try {
    await sendAccessRequestReceipt(email, DEV_TEAM_EMAILS[0]);
  } catch (err) {
    console.error('Contact receipt failed', err);
  }
  return NextResponse.json({ ok: true });
}
