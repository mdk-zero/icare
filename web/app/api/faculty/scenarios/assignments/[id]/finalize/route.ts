import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/faculty/scenarios/assignments/:id/finalize
// Locks the assignment: score = share of task points completed (by the student
// via the system, or by faculty), status -> completed.
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

    const [tasksRes, completionsRes] = await Promise.all([
      supabase.from('scenario_tasks').select('id, points').eq('scenario_id', assignment.scenario_id),
      supabase.from('scenario_task_completions').select('task_id').eq('assignment_id', assignmentId),
    ]);
    if (tasksRes.error || completionsRes.error) {
      return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
    }

    const tasks = tasksRes.data ?? [];
    const completedIds = new Set((completionsRes.data ?? []).map((c) => c.task_id));
    const totalPoints = tasks.reduce((sum, t) => sum + (t.points ?? 0), 0);
    const earnedPoints = tasks
      .filter((t) => completedIds.has(t.id))
      .reduce((sum, t) => sum + (t.points ?? 0), 0);
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

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
