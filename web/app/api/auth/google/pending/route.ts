import { NextResponse } from 'next/server';
import {
  clearGoogleOnboardingCookie,
  setGoogleOnboardingCookie,
  verifyGoogleOnboarding,
} from '@/app/lib/auth/session';

/**
 * The contact form's end of "Continue with Google" for someone with no
 * account. The token arrives in the /signup URL (from the web login page or
 * the mobile app); it is moved into an httpOnly cookie that /api/contact reads,
 * and only the email and name come back for the form to show.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const profile = token ? await verifyGoogleOnboarding(token) : null;
  if (!profile) {
    return NextResponse.json(
      { error: 'That Google sign-in has expired. Continue with Google again, or type your email.' },
      { status: 400 },
    );
  }
  await setGoogleOnboardingCookie(token);
  return NextResponse.json({ email: profile.email, name: profile.name });
}

/** "Use a different email": the request is then sent without a Google account. */
export async function DELETE() {
  await clearGoogleOnboardingCookie();
  return NextResponse.json({ ok: true });
}
