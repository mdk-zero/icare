import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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

  // Users may only request their own avatar
  if (!path.startsWith(`avatars/${session.uid}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
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
