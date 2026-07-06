import { NextResponse } from 'next/server';
import { findUserForPasswordReset, updateUserPassword, verifyPasswordResetOtp } from '@/app/lib/auth/reset';

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

  try {
    const user = await findUserForPasswordReset(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    if (!user.hasPassword) {
      return NextResponse.json(
        { error: 'This account uses Google sign-in and has no password set.' },
        { status: 403 },
      );
    }

    const ok = await verifyPasswordResetOtp(user.id, otp.trim());
    if (!ok) {
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
