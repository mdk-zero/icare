import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { loadAssignmentForms } from '@/app/lib/return-demo-forms-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/faculty/scenarios/assignments/:id/forms — the forms on a student's
// Return Demonstration (094) as they filled them in, for the grading sheet.
// Same access as grading the assignment: the student's instructor, or an admin.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignmentForms(supabase, id);
    if (!loaded) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (session.role !== 'admin') {
      const studentIds = await getFacultyStudentIds(supabase, session.uid);
      if (!studentIds.includes(loaded.assignment.student_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ forms: loaded.forms });
  } catch (err) {
    console.error('Failed to load submitted forms', err);
    return NextResponse.json({ error: 'Unable to load the forms' }, { status: 500 });
  }
}
