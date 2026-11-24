import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireDean } from '@/app/lib/auth/dean';
import { isMissingMigration } from '@/app/lib/auth/super-admin';
import { logAudit } from '@/app/lib/audit';
import { findProgramChair } from '@/app/lib/program-chairs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT { faculty_ids }: the Dean makes these exactly the instructors this
 * Program Chair looks after (100). An instructor may be on several Program
 * Chairs' lists. Only the Dean's own instructors can be assigned.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const guard = await requireDean();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { faculty_ids?: unknown } | null;
  const raw = body?.faculty_ids;
  if (!Array.isArray(raw) || raw.some((f) => typeof f !== 'string')) {
    return NextResponse.json({ error: 'faculty_ids must be an array of ids' }, { status: 400 });
  }
  const facultyIds = [...new Set(raw as string[])];

  try {
    const supabase = getSupabaseAdmin();
    const chair = await findProgramChair(supabase, session.uid, id);
    if (!chair) return NextResponse.json({ error: 'Program Chair not found' }, { status: 404 });

    if (facultyIds.length) {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'faculty')
        .eq('admin_id', session.uid)
        .in('id', facultyIds);
      if (error) throw error;
      if ((data ?? []).length !== facultyIds.length) {
        return NextResponse.json({ error: 'Some instructors were not found' }, { status: 404 });
      }
    }

    const removal = await supabase.from('program_chair_instructors').delete().eq('chair_id', id);
    if (removal.error) {
      if (isMissingMigration(removal.error)) {
        return NextResponse.json({ error: 'Assigning instructors is not available yet' }, { status: 503 });
      }
      throw removal.error;
    }
    if (facultyIds.length) {
      const { error } = await supabase
        .from('program_chair_instructors')
        .insert(facultyIds.map((faculty_id) => ({ chair_id: id, faculty_id })));
      if (error) throw error;
    }

    await logAudit(
      session,
      {
        action: 'user.update',
        entityType: 'users',
        entityId: id,
        details: { instructors_assigned: facultyIds.length, by: 'dean' },
      },
      request,
    );
    return NextResponse.json({ success: true, faculty_ids: facultyIds });
  } catch (err) {
    console.error('Assign Program Chair instructors failed', err);
    return NextResponse.json({ error: 'Unable to assign instructors' }, { status: 500 });
  }
}
