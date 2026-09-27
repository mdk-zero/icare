import { NextResponse } from 'next/server';
import { findUserForPasswordReset, updateUserPassword, verifyPasswordResetOtp } from '@/app/lib/auth/reset';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';

// Code guessing from one address. The per-code cap (MAX_OTP_ATTEMPTS) is the
// main brake; this stops one client cycling through many accounts' codes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, otp, newPassword } = body as {
    email?: unknown;
    otp?: unknown;
    newPassword?: unknown;
  };

  if (
    typeof email !== 'string' ||
    typeof otp !== 'string' ||
    typeof newPassword !== 'string' ||
    email.length === 0 ||
    otp.length === 0 ||
    newPassword.length === 0
  ) {
    return NextResponse.json({ error: 'Email, OTP, and new password are required' }, { status: 400 });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (!(await consumeRateLimit(`reset-code:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const user = await findUserForPasswordReset(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    // A Google-only account is never issued a code (the request route mails
    // a notice instead), so it falls through as an invalid code — answering
    // differently would tell a caller the account signs in with Google.
    const check = await verifyPasswordResetOtp(user.id, otp.trim());
    if (check === 'locked') {
      return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 });
    }
    if (check !== 'ok') {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    await updateUserPassword(user.id, newPassword);

    return NextResponse.json({ message: 'Password updated successfully.' }, { status: 200 });
  } catch (err) {
    console.error('Forgot password verify failed', err);
    return NextResponse.json(
      { error: 'Unable to reset password. Please try again later.' },
      { status: 500 },
    );
  }
}
