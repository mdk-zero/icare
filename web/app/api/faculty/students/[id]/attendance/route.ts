import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { isStudentInFacultySections } from '@/app/lib/roster';
import { loadActivityAttendance } from '@/app/lib/activity-attendance';
import { tallyAttendance } from '@/app/lib/attendance';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: one student's attendance, from the deadlines of every RetDem, Quiz and
 * Case Presentation they were given (lib/attendance.ts). The instructor who
 * supervises the student's group can excuse absences; the Dean only reads.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: studentId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const allowed =
      session.role === 'faculty'
        ? await isStudentInFacultySections(supabase, session.uid, studentId)
        : await canSeeStudent(supabase, session, studentId);
    if (!allowed) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const { rows, excusesReady } = await loadActivityAttendance(supabase, [studentId]);
    return NextResponse.json({
      rows,
      tally: tallyAttendance(rows.map((r) => r.status)),
      can_excuse: session.role === 'faculty',
      excuses_ready: excusesReady,
    });
  } catch (err) {
    console.error('Unable to load attendance', err);
    return NextResponse.json({ error: 'Unable to load attendance' }, { status: 500 });
  }
}
