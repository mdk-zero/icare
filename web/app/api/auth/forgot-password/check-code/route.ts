import { NextResponse } from 'next/server';
import { findUserForPasswordReset, verifyPasswordResetOtp } from '@/app/lib/auth/reset';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';

// Code guessing from one address. The per-code cap (MAX_OTP_ATTEMPTS) is the
// main brake; this stops one client cycling through many accounts' codes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, otp } = body as { email?: unknown; otp?: unknown };

  if (
    typeof email !== 'string' ||
    typeof otp !== 'string' ||
    email.length === 0 ||
    otp.length === 0
  ) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
  }

  if (!(await consumeRateLimit(`reset-code:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const user = await findUserForPasswordReset(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    // Verify without marking used — the code stays valid for the password step.
    const check = await verifyPasswordResetOtp(user.id, otp.trim(), false);
    if (check === 'locked') {
      return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 });
    }
    if (check !== 'ok') {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Code verified' }, { status: 200 });
  } catch (err) {
    console.error('Forgot password check-code failed', err);
    return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 });
  }
}
