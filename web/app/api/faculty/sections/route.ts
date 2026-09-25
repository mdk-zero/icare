import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultySectionIds } from '@/app/lib/roster';

/** The requesting faculty member's assigned sections (admin: all sections). */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (session.role === 'admin') {
      const { data: sections, error } = await supabase
        .from('sections')
        .select('id, name')
        .order('name');
      if (error) {
        console.error('Failed to list sections', error);
        return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
      }
      return NextResponse.json({ sections: sections ?? [] });
    }

    // The sections of the groups they supervise.
    const sectionIds = await getFacultySectionIds(supabase, session.uid);
    const { data: rows, error } = sectionIds.length
      ? await supabase.from('sections').select('id, name').in('id', sectionIds)
      : { data: [] as { id: string; name: string }[], error: null };

    if (error) {
      console.error('Failed to list faculty sections', error);
      return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
    }

    const sections = (rows ?? []).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ sections });
  } catch (err) {
    console.error('List faculty sections failed', err);
    return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
  }
}
