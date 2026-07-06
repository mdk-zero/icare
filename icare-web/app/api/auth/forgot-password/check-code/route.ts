import { NextResponse } from 'next/server';
import { findUserForPasswordReset, verifyPasswordResetOtp } from '@/app/lib/auth/reset';

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

  try {
    const user = await findUserForPasswordReset(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    // Verify without marking used — the code stays valid for the password step.
    const ok = await verifyPasswordResetOtp(user.id, otp.trim(), false);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Code verified' }, { status: 200 });
  } catch (err) {
    console.error('Forgot password check-code failed', err);
    return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 });
  }
}
