import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * Everything on the ward floor plan that is not a room: corridors, the nurse
 * station, stairs and so on (migration 062). Read by the Dean's Wards editor
 * and every read-only plan. Before 062 the table is missing, and this answers
 * `enabled: false` with no fixtures so the plan still draws its rooms.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ward_fixtures')
      .select('id, kind, label, plan_x, plan_y, plan_w, plan_h')
      .order('created_at');
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ fixtures: [], enabled: false });
      }
      console.error('Failed to list ward fixtures', error);
      return NextResponse.json({ error: 'Unable to load the floor plan' }, { status: 500 });
    }
    return NextResponse.json({ fixtures: data ?? [], enabled: true });
  } catch (err) {
    console.error('List ward fixtures failed', err);
    return NextResponse.json({ error: 'Unable to load the floor plan' }, { status: 500 });
  }
}
