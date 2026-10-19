import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import type { SessionPayload } from '@/app/lib/auth/jwt';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Instructors, Deans and Admins: the people who look at rosters. */
const STAFF_ROLES = new Set(['faculty', 'admin', 'super_admin']);

/** "avatars/<owner uid>/<random uuid>-<file name>", as POST /api/users/avatar names it. */
const AVATAR_PATH = /^avatars\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+$/i;

/**
 * Anyone may see their own photo. Staff may also see another user's, as long
 * as it is that user's current one. The file name carries a random UUID, so
 * holding the path means an API already showed them that person; checking
 * it against picture_url keeps a replaced photo from being opened again.
 * Students still see only their own.
 */
async function canView(session: SessionPayload, path: string): Promise<boolean> {
  if (path.startsWith(`avatars/${session.uid}/`)) return true;
  if (!STAFF_ROLES.has(session.role)) return false;
  const owner = AVATAR_PATH.exec(path)?.[1];
  if (!owner) return false;
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('picture_url')
    .eq('id', owner)
    .maybeSingle();
  if (error) throw error;
  return data?.picture_url === path;
}

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  try {
    if (!(await canView(session, path))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error('Signed URL generation failed', error);
      return NextResponse.json(
        { error: 'Unable to generate avatar URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error('GET /api/users/avatar-url failed', err);
    return NextResponse.json(
      { error: 'Unable to generate avatar URL' },
      { status: 500 },
    );
  }
}
