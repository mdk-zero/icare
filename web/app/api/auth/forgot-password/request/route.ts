import { NextResponse } from 'next/server';
import {
  findUserForPasswordReset,
  generateOtp,
  hasRecentPasswordResetOtp,
  storePasswordResetOtp,
} from '@/app/lib/auth/reset';
import { hashPassword } from '@/app/lib/auth/password';
import { sendGoogleAccountResetNotice, sendPasswordResetOtp } from '@/app/lib/auth/email';
import { consumeRateLimit } from '@/app/lib/auth/rate-limit';

const MAX_REQUESTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Matches the 60s "Resend in Ns" cooldown the web form already shows, so the
// button never promises a send the server is about to suppress.
const RESEND_COOLDOWN_MS = 60 * 1000;

// Identical whether or not the account exists, and whether or not a mail was
// actually sent -- all three branches must be indistinguishable to a caller.
const SUCCESS_MESSAGE = 'If this account exists, a reset code has been sent.';

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
  if (!(await consumeRateLimit(`forgot-password:${normalizedEmail}`, MAX_REQUESTS, WINDOW_MS))) {
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
      return NextResponse.json({ message: SUCCESS_MESSAGE }, { status: 200 });
    }

    // Google-only users have no password to reset. Tell their inbox, not the
    // caller: a distinct response here would reveal how the account signs in.
    if (!user.hasPassword) {
      await sendGoogleAccountResetNotice(user.email, user.name);
      return NextResponse.json({ message: SUCCESS_MESSAGE }, { status: 200 });
    }

    // A code issued moments ago is still valid for 10 minutes and
    // verifyPasswordResetOtp() picks the newest unused one, so re-sending here
    // would mail a second code that supersedes nothing. Returning the same
    // success shape keeps a caller that re-requests in a loop -- a screen that
    // re-sends on every render, say -- from turning into a mail flood.
    if (await hasRecentPasswordResetOtp(user.id, RESEND_COOLDOWN_MS)) {
      return NextResponse.json({ message: SUCCESS_MESSAGE }, { status: 200 });
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    await storePasswordResetOtp(user.id, otpHash);
    await sendPasswordResetOtp(user.email, otp, user.name);

    return NextResponse.json({ message: SUCCESS_MESSAGE }, { status: 200 });
  } catch (err) {
    console.error('Forgot password request failed', err);
    return NextResponse.json(
      { error: 'Unable to send reset code. Please try again later.' },
      { status: 500 },
    );
  }
}
