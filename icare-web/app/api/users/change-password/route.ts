import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/app/lib/auth/password';
import {
  generateOtp,
  storePasswordResetOtp,
  verifyPasswordResetOtp,
} from '@/app/lib/auth/reset';
import { sendPasswordChangeOtp } from '@/app/lib/auth/email';
import { checkRateLimit } from '@/app/lib/auth/rate-limit';

const MIN_PASSWORD_LENGTH = 8;
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
            { error: 'Current password is incorrect' },
            { status: 401 },
          );
        }
      }

      const limit = checkRateLimit(
        `change-password:${user.id}`,
        MAX_OTP_REQUESTS,
        OTP_WINDOW_MS,
      );
      if (!limit.allowed) {
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
      const otpValid = await verifyPasswordResetOtp(user.id, otp.trim(), false);
      if (!otpValid) {
        return NextResponse.json(
          { error: 'Invalid or expired verification code' },
          { status: 400 },
        );
      }

      return NextResponse.json({ otpVerified: true });
    }

    // Step 3: verify the OTP and update the password.
    const otpValid = await verifyPasswordResetOtp(user.id, otp.trim());
    if (!otpValid) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(newPassword);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newHash, force_password_change: false })
      .eq('id', session.uid);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/users/change-password failed', err);
    return NextResponse.json(
      { error: 'Unable to change password' },
      { status: 500 },
    );
  }
}
