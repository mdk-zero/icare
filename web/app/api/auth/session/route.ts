import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { toPublicUser, USER_SELECT } from '@/app/lib/auth/user';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select(`${USER_SELECT}, sections(name)`)
      .eq('id', session.uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ user: null }, { status: 200 });

    // Mobile's profile shows the student's section; it used to render a
    // hardcoded cohort string because the session never carried one.
    const section = (data.sections as unknown as { name?: string } | null)?.name ?? null;
    return NextResponse.json({ user: { ...toPublicUser(data), section } });
  } catch (err) {
    console.error('Session handler failed', err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
