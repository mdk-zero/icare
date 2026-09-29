import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendAccessRequestEmail, sendAccessRequestReceipt } from '@/app/lib/auth/email';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { findPendingAccessRequest } from '@/app/lib/access-requests';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { clearGoogleOnboardingCookie, readGoogleOnboarding } from '@/app/lib/auth/session';

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

type Sex = 'female' | 'male';
type AccessRequest = {
  name: string;
  email: string;
  sex: Sex;
  subject: string;
  message: string;
  /** The Google account picked on "Continue with Google", verified by Google. */
  google?: { sub: string; email: string };
};

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

    // One id across every admin's copy, so whoever accepts or declines it
    // settles it for all of them.
    const requestId = randomUUID();
    const { error: insertError } = await supabase.from('notifications').insert(
      admins.map((admin) => ({
        user_id: admin.id,
        type: 'system' as const,
        title: `Account request from ${req.name}`,
        body: `${req.email} · ${req.sex === 'female' ? 'Female' : 'Male'} · ${req.subject}: ${req.message}`,
        data: {
          kind: 'access_request',
          request_id: requestId,
          status: 'pending',
          name: req.name,
          email: req.email,
          sex: req.sex,
          subject: req.subject,
          ...(req.google ? { google_sub: req.google.sub, google_email: req.google.email } : {}),
        },
      })),
    );
    if (insertError) throw insertError;
    return true;
  } catch (err) {
    console.error('Failed to notify admins of access request', err);
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
  const sex: Sex | null = body.sex === 'female' || body.sex === 'male' ? body.sex : null;
  if (!name || !email || !sex || !subject || !message) {
    return NextResponse.json({ error: 'Fill in every field.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Checked before the rate limit so a repeat doesn't use up an attempt.
  if (await findPendingAccessRequest(email)) {
    return NextResponse.json(
      {
        code: 'already_requested',
        error:
          "You've already submitted a request with this email. The iCARE++ team will get back to you once it's reviewed.",
      },
      { status: 409 },
    );
  }

  if (!(await consumeRateLimit(`contact:${clientIp(request)}`, MAX_REQUESTS, WINDOW_MS))) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // Only a Google account whose verified email is the one being requested
  // rides along; "Use a different email" clears it before this point anyway.
  const onboarding = await readGoogleOnboarding();
  const google =
    onboarding && onboarding.email.toLowerCase() === email.toLowerCase()
      ? { sub: onboarding.sub, email: onboarding.email }
      : undefined;

  const accessRequest: AccessRequest = { name, email, sex, subject, message, google };
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

  if (onboarding) await clearGoogleOnboardingCookie();

  // The team's copy is what matters; a receipt that bounces (a typo'd address,
  // say) must not turn a delivered request into an error the person retries.
  try {
    await sendAccessRequestReceipt(email, DEV_TEAM_EMAILS[0]);
  } catch (err) {
    console.error('Contact receipt failed', err);
  }
  return NextResponse.json({ ok: true });
}
