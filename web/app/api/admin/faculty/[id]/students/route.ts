import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Replaces a faculty member's student roster with the given set. */
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

  const { student_ids } = body as { student_ids?: unknown };
  if (!Array.isArray(student_ids) || student_ids.some((s) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'student_ids must be an array of ids' }, { status: 400 });
  }
  const studentIds = [...new Set(student_ids as string[])];

  try {
    const supabase = getSupabaseAdmin();

    const { data: faculty } = await supabase
      .from('users')
      .select('id')
      .eq('id', facultyId)
      .eq('role', 'faculty')
      .maybeSingle();
    if (!faculty) {
      return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
    }

    if (studentIds.length > 0) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .in('id', studentIds);
      if ((count ?? 0) !== studentIds.length) {
        return NextResponse.json(
          { error: 'One or more ids are not student accounts' },
          { status: 400 },
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('faculty_students')
      .delete()
      .eq('faculty_id', facultyId);
    if (deleteError) {
      console.error('Failed to clear faculty roster', deleteError);
      return NextResponse.json({ error: 'Unable to update roster' }, { status: 500 });
    }

    if (studentIds.length > 0) {
      const { error: insertError } = await supabase
        .from('faculty_students')
        .insert(studentIds.map((student_id) => ({ faculty_id: facultyId, student_id })));
      if (insertError) {
        console.error('Failed to insert faculty roster', insertError);
        return NextResponse.json({ error: 'Unable to update roster' }, { status: 500 });
      }
    }

    await logAudit(
      session,
      {
        action: 'faculty.roster.update',
        entityType: 'faculty_students',
        entityId: facultyId,
        details: { student_count: studentIds.length },
      },
      request,
    );

    return NextResponse.json({ success: true, student_ids: studentIds });
  } catch (err) {
    console.error('Update faculty roster failed', err);
    return NextResponse.json({ error: 'Unable to update roster' }, { status: 500 });
  }
}
