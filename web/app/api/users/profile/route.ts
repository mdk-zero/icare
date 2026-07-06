import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { toPublicUser } from '@/app/lib/auth/user';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, picture_url, password_hash, force_password_change')
      .eq('id', session.uid)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: toPublicUser(data) });
  } catch (err) {
    console.error('GET /api/users/profile failed', err);
    return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name } = body as { name?: unknown };
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 120) {
    return NextResponse.json({ error: 'Name is too long' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .update({ name: trimmedName })
      .eq('id', session.uid)
      .select('id, email, name, role, picture_url, password_hash, force_password_change')
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: toPublicUser(data) });
  } catch (err) {
    console.error('PATCH /api/users/profile failed', err);
    return NextResponse.json({ error: 'Unable to update profile' }, { status: 500 });
  }
}
