import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

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

    const { data: links, error } = await supabase
      .from('faculty_sections')
      .select('sections(id, name)')
      .eq('faculty_id', session.uid);

    if (error) {
      console.error('Failed to list faculty sections', error);
      return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
    }

    const sections = (links ?? [])
      .map((l) => l.sections as unknown as { id: string; name: string } | null)
      .filter((s): s is { id: string; name: string } => Boolean(s))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ sections });
  } catch (err) {
    console.error('List faculty sections failed', err);
    return NextResponse.json({ error: 'Unable to list sections' }, { status: 500 });
  }
}
