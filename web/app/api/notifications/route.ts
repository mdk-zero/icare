import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, read_at, created_at')
      .eq('user_id', session.uid)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to fetch notifications', error);
      return NextResponse.json({ error: 'Unable to fetch notifications' }, { status: 500 });
    }

    const unread = (notifications ?? []).filter((n) => !n.read_at).length;
    return NextResponse.json({ notifications: notifications ?? [], unread });
  } catch (err) {
    console.error('Fetch notifications failed', err);
    return NextResponse.json({ error: 'Unable to fetch notifications' }, { status: 500 });
  }
}

/** Mark one ({ id }) or all ({ all: true }) of the caller's notifications read. */
export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, all } = body as { id?: unknown; all?: unknown };
  if (all !== true && (typeof id !== 'string' || id.length === 0)) {
    return NextResponse.json({ error: 'Provide id or all: true' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.uid)
      .is('read_at', null);
    if (all !== true) query = query.eq('id', id as string);

    const { error } = await query;
    if (error) {
      console.error('Failed to mark notifications read', error);
      return NextResponse.json({ error: 'Unable to update notifications' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mark notifications read failed', err);
    return NextResponse.json({ error: 'Unable to update notifications' }, { status: 500 });
  }
}
