import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/student/scenarios/:assignmentId/start
// The student confirms they are ready: the patient case's clock starts now and
// runs until the instructor grades the last task. Starting again keeps the
// first start. Before migration 063 there is no clock, and started_at comes
// back null with timing: false.
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    // select('*') so a database without started_at still answers.
    const { data: assignment } = await supabase
      .from('scenario_assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!('started_at' in assignment)) {
      return NextResponse.json({ started_at: null, timing: false });
    }
    if (assignment.status === 'completed') {
      return NextResponse.json({ error: 'This patient case has already been graded' }, { status: 409 });
    }
    if (assignment.started_at) {
      return NextResponse.json({ started_at: assignment.started_at, timing: true });
    }

    const update: Record<string, unknown> = { started_at: new Date().toISOString() };
    if (assignment.status === 'pending') update.status = 'in_progress';

    // Only an unstarted row is stamped, so two taps can't move the start.
    const { data: updated, error } = await supabase
      .from('scenario_assignments')
      .update(update)
      .eq('id', assignmentId)
      .is('started_at', null)
      .select('started_at')
      .maybeSingle();
    if (error) {
      console.error('Failed to start patient case', error);
      return NextResponse.json({ error: 'Unable to start patient case' }, { status: 500 });
    }
    if (!updated) {
      const { data: current } = await supabase
        .from('scenario_assignments')
        .select('started_at')
        .eq('id', assignmentId)
        .maybeSingle();
      return NextResponse.json({ started_at: current?.started_at ?? null, timing: true });
    }

    return NextResponse.json({ started_at: updated.started_at, timing: true });
  } catch (err) {
    console.error('Start patient case failed', err);
    return NextResponse.json({ error: 'Unable to start patient case' }, { status: 500 });
  }
}
