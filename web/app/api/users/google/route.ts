import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { verifyGoogleIdToken } from '@/app/lib/auth/google';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { toPublicUser, USER_SELECT } from '@/app/lib/auth/user';
import { logAudit } from '@/app/lib/audit';

/**
 * "Connect to Google" on a profile: ties any Google account to the signed-in
 * user, so "Continue with Google" signs them in too. The mobile app sends its
 * own client's ID token, which verifyGoogleIdToken accepts alongside the web's.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id_token?: unknown } | null;
  const idToken = typeof body?.id_token === 'string' ? body.id_token : '';
  if (!idToken) return NextResponse.json({ error: 'Missing id_token' }, { status: 400 });

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (err) {
    console.error('Google connect: id_token verification failed', err);
    return NextResponse.json({ error: 'Invalid Google credential' }, { status: 401 });
  }
  if (!profile.emailVerified) {
    return NextResponse.json({ error: 'That Google account has no verified email' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: holder } = await supabase
      .from('users')
      .select('id')
      .eq('google_sub', profile.sub)
      .maybeSingle();
    if (holder && holder.id !== session.uid) {
      return NextResponse.json(
        { error: 'This Google account is already connected to another iCARE++ user.' },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from('users')
      .update({ google_sub: profile.sub })
      .eq('id', session.uid)
      .select(USER_SELECT)
      .single();
    if (error) {
      // The unique index settles a race with another account connecting it.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'This Google account is already connected to another iCARE++ user.' },
          { status: 409 },
        );
      }
      throw error;
    }

    await logAudit(
      session,
      { action: 'user.google_connect', entityType: 'users', entityId: session.uid, details: { google_email: profile.email } },
      request,
    );
    return NextResponse.json({ user: toPublicUser(data), google_email: profile.email });
  } catch (err) {
    console.error('Google connect failed', err);
    return NextResponse.json({ error: 'Unable to connect Google' }, { status: 500 });
  }
}

/** Disconnect. Only with a password to fall back on, so no one locks themselves out. */
export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: current, error: readError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', session.uid)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!current.password_hash) {
      return NextResponse.json(
        { error: 'Set a password first, or you would have no way to sign in.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('users')
      .update({ google_sub: null })
      .eq('id', session.uid)
      .select(USER_SELECT)
      .single();
    if (error) throw error;

    await logAudit(
      session,
      { action: 'user.google_disconnect', entityType: 'users', entityId: session.uid },
      request,
    );
    return NextResponse.json({ user: toPublicUser(data) });
  } catch (err) {
    console.error('Google disconnect failed', err);
    return NextResponse.json({ error: 'Unable to disconnect Google' }, { status: 500 });
  }
}
