import { NextResponse } from 'next/server';
import { readSession, reissueSession, updateUser } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/app/lib/auth/password';
import {
  generateOtp,
  storePasswordResetOtp,
  verifyPasswordResetOtp,
} from '@/app/lib/auth/reset';
import { sendPasswordChangeOtp } from '@/app/lib/auth/email';
import { consumeRateLimit } from '@/app/lib/auth/rate-limit';

const MIN_PASSWORD_LENGTH = 8;

function otpRejected(check: 'invalid' | 'locked'): NextResponse {
  return check === 'locked'
    ? NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 })
    : NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
}
const MAX_OTP_REQUESTS = 3;
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { currentPassword, newPassword, otp, verifyOnly } = body as {
    currentPassword?: unknown;
    newPassword?: unknown;
    otp?: unknown;
    verifyOnly?: unknown;
  };

  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    return NextResponse.json(
      { error: 'New password is required' },
      { status: 400 },
    );
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, password_hash, force_password_change')
      .eq('id', session.uid)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }

    const isForcedChange = user.force_password_change === true;

    // Forced first-login password change: skip OTP/current-password verification.
    if (isForcedChange) {
      const newHash = await hashPassword(newPassword);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: newHash, force_password_change: false })
        .eq('id', session.uid);

      if (updateError) throw updateError;

      // Not revoked: the only session is the one that just used the temporary
      // password, and installed app builds that predate sessionToken would be
      // signed out in the middle of their first sign-in.
      return NextResponse.json({ success: true });
    }

    const hasPassword = Boolean(user.password_hash);

    // Step 1: request an OTP to confirm the password change.
    if (typeof otp !== 'string' || otp.length === 0) {
      if (hasPassword) {
        if (
          typeof currentPassword !== 'string' ||
          currentPassword.length === 0
        ) {
          return NextResponse.json(
            { error: 'Current password is required' },
            { status: 400 },
          );
        }

        const valid = await verifyPassword(currentPassword, user.password_hash!);
        if (!valid) {
          return NextResponse.json(
            // Not 401: clients read that as "signed out" and leave the form.
            { error: 'Current password is incorrect' },
            { status: 400 },
          );
        }
      }

      if (!(await consumeRateLimit(`change-password:${user.id}`, MAX_OTP_REQUESTS, OTP_WINDOW_MS))) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 },
        );
      }

      const generatedOtp = generateOtp();
      const otpHash = await hashPassword(generatedOtp);
      await storePasswordResetOtp(user.id, otpHash);
      const sendResult = await sendPasswordChangeOtp(user.email, generatedOtp, user.name);

      return NextResponse.json(
        {
          requiresOtp: true,
          message: sendResult.skipped
            ? 'Email sending is skipped in development. Use the code shown below.'
            : 'A verification code has been sent to your email. It will expire in 10 minutes.',
          devOtp: sendResult.skipped ? generatedOtp : undefined,
        },
        { status: 200 },
      );
    }

    // Step 2 (optional): verify the OTP without updating the password yet.
    if (verifyOnly === true) {
      const check = await verifyPasswordResetOtp(user.id, otp.trim(), false);
      if (check !== 'ok') return otpRejected(check);

      return NextResponse.json({ otpVerified: true });
    }

    // Step 3: verify the OTP and update the password.
    const check = await verifyPasswordResetOtp(user.id, otp.trim());
    if (check !== 'ok') return otpRejected(check);

    const newHash = await hashPassword(newPassword);
    // Every other device signs out; this one gets a fresh token.
    const { error: updateError } = await updateUser(
      session.uid,
      { password_hash: newHash, force_password_change: false },
      { revoke: true },
    );
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, sessionToken: await reissueSession(session) });
  } catch (err) {
    console.error('POST /api/users/change-password failed', err);
    return NextResponse.json(
      { error: 'Unable to change password' },
      { status: 500 },
    );
  }
}
