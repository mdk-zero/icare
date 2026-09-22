import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { scoreAssignment, syncStepGradedLevels } from '@/app/lib/scenario-tasks';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/faculty/scenarios/assignments/:id/finalize
// Locks the assignment: score = each task's points scaled by its verbal rating,
// or by its sub-tasks' ratings once any are rated (an unrated completion keeps
// full credit), status -> completed.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: assignment } = await supabase
      .from('scenario_assignments')
      .select('id, student_id, scenario_id, status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (session.role !== 'admin') {
      const studentIds = await getFacultyStudentIds(supabase, session.uid);
      if (!studentIds.includes(assignment.student_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (assignment.status === 'completed') {
      return NextResponse.json({ error: 'This scenario is already finalized' }, { status: 409 });
    }

    const graded = await scoreAssignment(supabase, assignmentId, assignment.scenario_id);
    if (graded.error) {
      console.error('Failed to score assignment', graded.error);
      return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
    }
    const { score } = graded;
    // Students read each task's overall level from here on; settle it first.
    await syncStepGradedLevels(supabase, assignmentId, graded.completions, graded.stepsByTask, session.uid);

    const { data: updated, error } = await supabase
      .from('scenario_assignments')
      .update({
        status: 'completed',
        score,
        completed_at: new Date().toISOString(),
        finalized_by: session.uid,
      })
      .eq('id', assignmentId)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken, submitted_at, finalized_by')
      .single();

    if (error || !updated) {
      console.error('Failed to finalize assignment', error);
      return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
    }

    return NextResponse.json({ assignment: updated, score });
  } catch (err) {
    console.error('Finalize assignment failed', err);
    return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
  }
}
