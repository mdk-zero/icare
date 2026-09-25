import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getAdminScope, ownsFaculty } from '@/app/lib/admin-scope';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Replaces a faculty member's assigned sections with the given set. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: facultyId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { section_ids } = body as { section_ids?: unknown };
  if (!Array.isArray(section_ids) || section_ids.some((s) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'section_ids must be an array of ids' }, { status: 400 });
  }
  const sectionIds = [...new Set(section_ids as string[])];

  try {
    const supabase = getSupabaseAdmin();

    const { data: faculty } = await supabase
      .from('users')
      .select('id')
      .eq('id', facultyId)
      .eq('role', 'faculty')
      .maybeSingle();
    // An admin manages only their own faculty, within their own sections.
    const scope = await getAdminScope(supabase, session.uid);
    if (!faculty || !ownsFaculty(scope, facultyId)) {
      return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
    }
    if (scope) {
      const { data: current } = await supabase.from('faculty_sections').select('section_id').eq('faculty_id', facultyId);
      const allowed = new Set([...scope.sectionIds, ...(current ?? []).map((c) => c.section_id as string)]);
      const outside = sectionIds.filter((id) => !allowed.has(id));
      if (outside.length > 0) {
        return NextResponse.json({ error: 'Some sections belong to another admin', invalid: outside }, { status: 403 });
      }
    }

    if (sectionIds.length > 0) {
      const { count } = await supabase
        .from('sections')
        .select('id', { count: 'exact', head: true })
        .in('id', sectionIds);
      if ((count ?? 0) !== sectionIds.length) {
        return NextResponse.json({ error: 'One or more ids are not sections' }, { status: 400 });
      }
    }

    const { error: deleteError } = await supabase
      .from('faculty_sections')
      .delete()
      .eq('faculty_id', facultyId);
    if (deleteError) {
      console.error('Failed to clear faculty sections', deleteError);
      return NextResponse.json({ error: 'Unable to update sections' }, { status: 500 });
    }

    if (sectionIds.length > 0) {
      const { error: insertError } = await supabase
        .from('faculty_sections')
        .insert(sectionIds.map((section_id) => ({ faculty_id: facultyId, section_id })));
      if (insertError) {
        console.error('Failed to insert faculty sections', insertError);
        return NextResponse.json({ error: 'Unable to update sections' }, { status: 500 });
      }
    }

    await logAudit(
      session,
      {
        action: 'faculty.sections.update',
        entityType: 'faculty_sections',
        entityId: facultyId,
        details: { section_count: sectionIds.length },
      },
      request,
    );

    return NextResponse.json({ success: true, section_ids: sectionIds });
  } catch (err) {
    console.error('Update faculty sections failed', err);
    return NextResponse.json({ error: 'Unable to update sections' }, { status: 500 });
  }
}
