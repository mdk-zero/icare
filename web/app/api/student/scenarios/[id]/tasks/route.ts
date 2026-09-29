import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  fetchStepRatings,
  fetchTaskCompletions,
  fetchTaskSteps,
  stepGradesByTask,
} from '@/app/lib/scenario-tasks';
import { isPerformed, taskCredit, type StepGrades } from '@/app/lib/task-ratings';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/scenarios/:assignmentId/tasks
// Returns the scenario's tasks with each one's completion state for this
// student's assignment. The instructor grades on the web, a save at a time; a
// task's rating, note and percentage are shown to the student as soon as a
// save has graded it, so the phone follows along while the scenario is still
// open. Everything is shown once it is completed.
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

    const [tasksRes, completions] = await Promise.all([
      supabase
        .from('scenario_tasks')
        .select('id, title, description, category, points, verification, system_trigger, sort_order')
        .eq('scenario_id', assignment.scenario_id)
        .order('sort_order', { ascending: true }),
      fetchTaskCompletions(supabase, [assignmentId]),
    ]);

    if (tasksRes.error || completions.error) {
      console.error('Failed to fetch patient case tasks', tasksRes.error, completions.error);
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }

    const completionByTask = new Map(completions.rows.map((c) => [c.task_id, c]));
    const completed = assignment.status === 'completed';

    // Each task's share of its own points, as the instructor's checklist shows
    // it: its sub-tasks' ratings once any are rated, else its whole-task one.
    const [steps, stepRatings] = await Promise.all([
      fetchTaskSteps(supabase, (tasksRes.data ?? []).map((t) => t.id as string)),
      fetchStepRatings(supabase, [assignmentId]),
    ]);
    if (steps.error || stepRatings.error) {
      console.error('Failed to fetch sub-task ratings', steps.error, stepRatings.error);
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }
    const stepsByTask: Map<string, StepGrades> = stepGradesByTask(steps.steps, stepRatings.rows);

    const tasks = (tasksRes.data ?? []).map((t) => {
      const completion = completionByTask.get(t.id);
      // A saved rating means the instructor has graded this task; drafts never
      // reach the database, so there is nothing half-done to leak.
      const released = completed || Boolean(completion?.rating);
      return {
        ...t,
        is_completed: isPerformed(completion),
        completed_via: completion?.completed_via ?? null,
        completed_at: completion?.completed_at ?? null,
        rating: released ? (completion?.rating ?? null) : null,
        remarks: released ? (completion?.remarks ?? null) : null,
        percent: released ? Math.round(taskCredit(completion, stepsByTask.get(t.id)) * 100) : null,
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
    console.error('Fetch patient case tasks failed', err);
    return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
  }
}
