import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/** All sections, for pickers. Any signed-in faculty/admin can read. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: sections, error } = await supabase
      .from('sections')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Failed to list sections', error);
      return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
    }

    return NextResponse.json({ sections: sections ?? [] });
  } catch (err) {
    console.error('List sections failed', err);
    return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
  }
}
