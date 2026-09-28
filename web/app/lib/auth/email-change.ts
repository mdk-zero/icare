/**
 * Changing an account's sign-in email (migration 058).
 *
 * Who may change whose email, checked against the live rows on every step:
 *   - anyone but a student may change their own;
 *   - an admin may change the faculty accounts they own (users.admin_id);
 *   - a super admin may change any account that isn't a student's.
 * Student emails are fixed: they are institutional and the mobile app signs
 * students in by them.
 *
 * A change is two steps. Requesting it checks the address and sends a code to
 * the NEW inbox; confirming it with that code swaps the email, unlinks Google
 * (so the next Google sign-in with the new address claims the account), and
 * tells the OLD inbox what happened.
 */
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../supabase/server';
import { getAdminScope, ownsFaculty } from '../admin-scope';
import { logAudit } from '../audit';
import { hashPassword, verifyPassword } from './password';
import { generateOtp } from './reset';
import { sendEmailChangeOtp, sendEmailChangedNotice } from './email';
import { readSuperAdminSession } from './super-admin';
import { setSessionCookie, signSession, type SessionPayload } from './session';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface EmailTarget {
  id: string;
  email: string;
  name: string;
  role: string;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

const NOT_READY = 'Email changes are not set up yet (migration 058 has not been applied).';

/** Whether this session may change the target account's email, from the live rows. */
export async function authorizeEmailChange(
  supabase: Supabase,
  session: SessionPayload,
  targetId: string,
): Promise<Outcome<EmailTarget>> {
  const { data: target } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', targetId)
    .maybeSingle();
  if (!target) return fail(404, 'User not found');
  if (target.role === 'student') return fail(403, "A student's email can't be changed");

  if (session.uid === target.id) return { ok: true, value: target as EmailTarget };

  // The token's role can be up to 7 days stale; a super admin is re-checked live.
  if (session.role === 'super_admin') {
    return (await readSuperAdminSession()) ? { ok: true, value: target as EmailTarget } : fail(403, 'Forbidden');
  }
  if (session.role === 'admin') {
    const { data: me } = await supabase.from('users').select('role').eq('id', session.uid).maybeSingle();
    if (me?.role !== 'admin' || target.role !== 'faculty') return fail(403, 'You can only change the email of instructors you manage');
    const scope = await getAdminScope(supabase, session.uid);
    if (!ownsFaculty(scope, target.id)) return fail(403, 'You can only change the email of instructors you manage');
    return { ok: true, value: target as EmailTarget };
  }
  return fail(403, 'Forbidden');
}

async function emailTaken(supabase: Supabase, email: string, exceptId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('id').eq('email', email).neq('id', exceptId).limit(1);
  return (data ?? []).length > 0;
}

/** Step 1: validate the new address and send it a code. */
export async function requestEmailChange(
  session: SessionPayload,
  targetId: string,
  rawEmail: unknown,
): Promise<Outcome<{ new_email: string; devOtp?: string }>> {
  const supabase = getSupabaseAdmin();
  const newEmail = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(newEmail)) return fail(400, 'Enter a valid email address');

  const auth = await authorizeEmailChange(supabase, session, targetId);
  if (!auth.ok) return auth;
  const target = auth.value;
  if (newEmail === target.email.toLowerCase()) return fail(400, 'That is already the email on this account');
  if (await emailTaken(supabase, newEmail, target.id)) return fail(409, 'Another account already uses this email');

  const now = Date.now();
  const { data: recent, error: recentError } = await supabase
    .from('email_change_requests')
    .select('id, created_at')
    .eq('user_id', target.id)
    .is('used_at', null)
    .gt('created_at', new Date(now - RESEND_COOLDOWN_MS).toISOString())
    .limit(1);
  if (recentError) {
    if (isMissingTable(recentError)) return fail(503, NOT_READY);
    throw recentError;
  }
  if ((recent ?? []).length > 0) return fail(429, 'A code was just sent. Wait a minute before asking for another.');

  // A new request replaces any open one, so an old code can't confirm it.
  await supabase
    .from('email_change_requests')
    .update({ used_at: new Date(now).toISOString() })
    .eq('user_id', target.id)
    .is('used_at', null);

  const otp = generateOtp();
  const { error } = await supabase.from('email_change_requests').insert({
    user_id: target.id,
    new_email: newEmail,
    otp_hash: await hashPassword(otp),
    requested_by: session.uid,
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  });
  if (error) throw error;

  const sent = await sendEmailChangeOtp(newEmail, otp, target.name);
  return { ok: true, value: { new_email: newEmail, devOtp: sent.skipped ? otp : undefined } };
}

/** Step 2: check the code and make the change. */
export async function confirmEmailChange(
  session: SessionPayload,
  targetId: string,
  rawCode: unknown,
  request?: NextRequest,
): Promise<Outcome<{ id: string; email: string }>> {
  const supabase = getSupabaseAdmin();
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!/^\d{6}$/.test(code)) return fail(400, 'Enter the 6-digit code');

  const auth = await authorizeEmailChange(supabase, session, targetId);
  if (!auth.ok) return auth;
  const target = auth.value;

  const { data: pending, error } = await supabase
    .from('email_change_requests')
    .select('id, new_email, otp_hash, attempts, requested_by')
    .eq('user_id', target.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return fail(503, NOT_READY);
    throw error;
  }
  // Only whoever asked may finish it.
  if (!pending || pending.requested_by !== session.uid) {
    return fail(400, 'No email change is waiting for a code. Request a new one.');
  }

  if (!(await verifyPassword(code, pending.otp_hash as string))) {
    const attempts = (pending.attempts as number) + 1;
    await supabase
      .from('email_change_requests')
      .update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { used_at: new Date().toISOString() } : {}) })
      .eq('id', pending.id);
    return attempts >= MAX_ATTEMPTS
      ? fail(429, 'Too many wrong codes. Request a new one.')
      : fail(400, 'That code is not right');
  }

  const newEmail = pending.new_email as string;
  // Someone may have taken the address while the code was in flight.
  if (await emailTaken(supabase, newEmail, target.id)) {
    await supabase.from('email_change_requests').update({ used_at: new Date().toISOString() }).eq('id', pending.id);
    return fail(409, 'Another account already uses this email');
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ email: newEmail, google_sub: null })
    .eq('id', target.id);
  if (updateError) {
    // The unique index on users.email is the last word on a race.
    if ((updateError as { code?: string }).code === '23505') return fail(409, 'Another account already uses this email');
    throw updateError;
  }
  await supabase.from('email_change_requests').update({ used_at: new Date().toISOString() }).eq('id', pending.id);

  await logAudit(
    session,
    {
      action: 'user.email_change',
      entityType: 'users',
      entityId: target.id,
      details: { old_email: target.email, new_email: newEmail, self: session.uid === target.id },
    },
    request,
  );

  sendEmailChangedNotice(target.email, target.name, newEmail).catch((err) =>
    console.error('Failed to send the email-changed notice', err),
  );

  // The session token carries the email; keep the holder's own in step.
  if (session.uid === target.id) {
    await setSessionCookie(await signSession({ ...session, email: newEmail }));
  }

  return { ok: true, value: { id: target.id, email: newEmail } };
}
