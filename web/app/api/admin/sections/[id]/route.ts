import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Deleting a section unassigns its students (users.section_id -> null) and
 * removes faculty links (faculty_sections cascade).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: section } = await supabase
      .from('sections')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete section', error);
      return NextResponse.json({ error: 'Unable to delete section' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'section.delete', entityType: 'sections', entityId: id, details: { name: section.name } },
      request,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete section failed', err);
    return NextResponse.json({ error: 'Unable to delete section' }, { status: 500 });
  }
}
