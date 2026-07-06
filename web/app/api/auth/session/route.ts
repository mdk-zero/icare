import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { toPublicUser } from '@/app/lib/auth/user';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, picture_url, password_hash, force_password_change')
      .eq('id', session.uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user: toPublicUser(data) });
  } catch (err) {
    console.error('Session handler failed', err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
