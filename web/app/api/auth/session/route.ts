import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { toPublicUser, withUserColumns } from '@/app/lib/auth/user';

/**
 * `{ user: null }` means signed out, and clients act on it by dropping the
 * session, so it is only ever sent for a missing or revoked session. A failed
 * lookup is a 500, which clients ride out.
 */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await withUserColumns((columns) =>
      supabase.from('users').select(`${columns}, sections!section_id(name)`).eq('id', session.uid).maybeSingle(),
    );
    if (error) throw error;
    if (!data) return NextResponse.json({ user: null }, { status: 200 });

    // Mobile's profile shows the student's section; it used to render a
    // hardcoded cohort string because the session never carried one.
    const section = (data as { sections?: { name?: string } | null }).sections?.name ?? null;
    return NextResponse.json({ user: { ...toPublicUser(data), section } });
  } catch (err) {
    console.error('Session handler failed', err);
    return NextResponse.json({ error: 'Unable to load your session' }, { status: 500 });
  }
}
