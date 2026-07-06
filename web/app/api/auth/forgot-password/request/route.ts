import { NextResponse } from 'next/server';
import { findUserForPasswordReset, generateOtp, storePasswordResetOtp } from '@/app/lib/auth/reset';
import { hashPassword } from '@/app/lib/auth/password';
import { sendPasswordResetOtp } from '@/app/lib/auth/email';
import { checkRateLimit } from '@/app/lib/auth/rate-limit';

const MAX_REQUESTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = (body as { email?: unknown })?.email;
  if (typeof email !== 'string' || email.length === 0) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Rate limit by email.
  const limit = checkRateLimit(`forgot-password:${normalizedEmail}`, MAX_REQUESTS, WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  try {
    const user = await findUserForPasswordReset(normalizedEmail);

    // Always return a generic-looking success if the user doesn't exist,
    // but don't send an email.
    if (!user) {
      return NextResponse.json(
        { message: 'If this account exists, a reset code has been sent.' },
        { status: 200 },
      );
    }

    // Google-only users cannot reset a password they don't have.
    if (!user.hasPassword) {
      return NextResponse.json(
        {
          error: 'google_no_password',
          message: 'This account uses Google sign-in and has no password set.',
        },
        { status: 403 },
      );
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    await storePasswordResetOtp(user.id, otpHash);
    await sendPasswordResetOtp(user.email, otp, user.name);

    return NextResponse.json(
      { message: 'If this account exists, a reset code has been sent.' },
      { status: 200 },
    );
  } catch (err) {
    console.error('Forgot password request failed', err);
    return NextResponse.json(
      { error: 'Unable to send reset code. Please try again later.' },
      { status: 500 },
    );
  }
}
