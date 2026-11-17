import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { loadStudentCases } from '@/app/lib/student-cases';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/faculty/students/:id/cases — one student's case presentations, for
// their profile: the same list the student sees, to instructors who teach them.
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    if (!(await canSeeStudent(supabase, session, id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ cases: await loadStudentCases(supabase, id) });
  } catch (err) {
    console.error('Failed to list a student’s cases', err);
    return NextResponse.json({ error: 'Unable to load the case presentations' }, { status: 500 });
  }
}
