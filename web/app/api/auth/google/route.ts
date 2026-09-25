import { NextResponse } from 'next/server';
import { verifyGoogleIdToken } from '@/app/lib/auth/google';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  findUserByGoogleSub,
  toPublicUser,
  touchLastLogin,
  USER_SELECT,
} from '@/app/lib/auth/user';
import { setSessionCookie, signSession } from '@/app/lib/auth/session';

/**
 * An account the team created with this email but that has never signed in
 * with Google. Google has verified the address, so the first Google sign-in
 * claims it; an account already tied to a different Google identity is left
 * alone.
 */
async function claimAccountByEmail(sub: string, email: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .update({ google_sub: sub })
    .eq('email', email.trim().toLowerCase())
    .is('google_sub', null)
    .select(USER_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const idToken = (body as { id_token?: unknown })?.id_token;
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json({ error: 'Missing id_token' }, { status: 400 });
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (err) {
    console.error('Google id_token verification failed', err);
    return NextResponse.json(
      { error: 'Invalid Google credential' },
      { status: 401 },
    );
  }

  if (!profile.emailVerified) {
    return NextResponse.json(
      { error: 'Google email is not verified' },
      { status: 403 },
    );
  }

  try {
    const existing =
      (await findUserByGoogleSub(profile.sub)) ??
      (await claimAccountByEmail(profile.sub, profile.email));

    if (existing) {
      await touchLastLogin(existing.id);
      const publicUser = toPublicUser(existing);
      const token = await signSession({
        uid: publicUser.id,
        role: publicUser.role,
        email: publicUser.email,
      });
      await setSessionCookie(token);
      return NextResponse.json({ user: publicUser, sessionToken: token });
    }

    // Accounts are created by the team, never on first sign-in.
    return NextResponse.json(
      { error: 'No iCARE++ account uses this Google email. Use Contact us to request account activation.' },
      { status: 403 },
    );
  } catch (err) {
    console.error('Google auth handler failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
