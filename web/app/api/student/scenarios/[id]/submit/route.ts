import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/student/scenarios/:assignmentId/submit
// The student hands their part in for review. This does not finalize or score
// the assignment — faculty complete their check-offs and finalize afterwards.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // time_taken is optional; an empty body is fine.
  }
  const { time_taken } = body as { time_taken?: unknown };
  const timeTaken =
    typeof time_taken === 'number' && time_taken >= 0 ? Math.round(time_taken) : null;

  try {
    const supabase = getSupabaseAdmin();

    const { data: assignment } = await supabase
      .from('scenario_assignments')
      .select('id, student_id, status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (assignment.status === 'completed') {
      return NextResponse.json({ error: 'This scenario has already been finalized' }, { status: 409 });
    }

    const update: Record<string, unknown> = {
      submitted_at: new Date().toISOString(),
      status: 'in_progress',
    };
    if (timeTaken !== null) update.time_taken = timeTaken;

    const { data: updated, error } = await supabase
      .from('scenario_assignments')
      .update(update)
      .eq('id', assignmentId)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken, submitted_at, finalized_by')
      .single();

    if (error || !updated) {
      console.error('Failed to submit assignment', error);
      return NextResponse.json({ error: 'Unable to submit scenario' }, { status: 500 });
    }

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    console.error('Submit assignment failed', err);
    return NextResponse.json({ error: 'Unable to submit scenario' }, { status: 500 });
  }
}
