import { NextResponse } from 'next/server';
import type { UserRole } from '@/app/lib/supabase/server';
import { createGoogleUser, toPublicUser } from '@/app/lib/auth/user';
import {
  clearGoogleOnboardingCookie,
  readGoogleOnboarding,
  setSessionCookie,
  signSession,
} from '@/app/lib/auth/session';

const VALID_ROLES: UserRole[] = ['faculty', 'admin'];

export async function POST(request: Request) {
  const pending = await readGoogleOnboarding();
  if (!pending) {
    return NextResponse.json(
      { error: 'No pending Google sign-in. Please try signing in again.' },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { role } = body as { role?: unknown };
  if (!VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const user = await createGoogleUser(pending, role as UserRole);
    const publicUser = toPublicUser(user);
    const token = await signSession({
      uid: publicUser.id,
      role: publicUser.role,
      email: publicUser.email,
    });
    await setSessionCookie(token);
    await clearGoogleOnboardingCookie();

    return NextResponse.json({ user: publicUser, sessionToken: token });
  } catch (err) {
    console.error('Google registration failed', err);
    return NextResponse.json(
      { error: 'Unable to create account' },
      { status: 500 },
    );
  }
}
