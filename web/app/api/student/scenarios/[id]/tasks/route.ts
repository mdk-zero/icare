import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/scenarios/:assignmentId/tasks
// Returns the scenario's tasks with each one's completion state for this
// student's assignment (system tasks auto-complete; faculty tasks are checked
// off on the web).
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: assignment } = await supabase
      .from('scenario_assignments')
      .select('id, student_id, scenario_id, status, submitted_at, completed_at, score, time_taken')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [tasksRes, completionsRes] = await Promise.all([
      supabase
        .from('scenario_tasks')
        .select('id, title, description, category, points, verification, system_trigger, sort_order')
        .eq('scenario_id', assignment.scenario_id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('scenario_task_completions')
        .select('task_id, completed_via, completed_at')
        .eq('assignment_id', assignmentId),
    ]);

    if (tasksRes.error || completionsRes.error) {
      console.error('Failed to fetch scenario tasks', tasksRes.error, completionsRes.error);
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }

    const completionByTask = new Map(
      (completionsRes.data ?? []).map((c) => [c.task_id, c]),
    );

    const tasks = (tasksRes.data ?? []).map((t) => {
      const completion = completionByTask.get(t.id);
      return {
        ...t,
        is_completed: Boolean(completion),
        completed_via: completion?.completed_via ?? null,
        completed_at: completion?.completed_at ?? null,
      };
    });

    return NextResponse.json({
      tasks,
      assignment: {
        id: assignment.id,
        status: assignment.status,
        submitted_at: assignment.submitted_at,
        completed_at: assignment.completed_at,
        score: assignment.score,
        time_taken: assignment.time_taken,
      },
    });
  } catch (err) {
    console.error('Fetch scenario tasks failed', err);
    return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
  }
}
