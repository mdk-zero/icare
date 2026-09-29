import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { scoreAssignment, syncStepGradedLevels } from '@/app/lib/scenario-tasks';
import {
  activeGradeEditApproval,
  EDIT_NEEDS_APPROVAL,
  needsEditApproval,
  spendGradeEditApproval,
} from '@/app/lib/grade-edit-requests';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/faculty/scenarios/assignments/:id/finalize
// Saves the grade: score = each task's points scaled by its verbal rating, or
// by its sub-tasks' ratings once any are rated (an unrated completion keeps
// full credit). The scenario completes only once every checklist row is
// graded; until then a save is progress — the student sees each graded task
// straight away and keeps the scenario (and their patient) open. Saving again
// after an edit re-scores it and keeps the date it was first completed.
export async function POST(request: NextRequest, { params }: RouteParams) {
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
      .select('id, student_id, scenario_id, status, completed_at')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (session.role !== 'admin') {
      const studentIds = await getFacultyStudentIds(supabase, session.uid);
      if (!studentIds.includes(assignment.student_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Re-saving a completed grade is an edit: faculty need an admin's approval,
    // which this save then uses up.
    const approval =
      assignment.status === 'completed' && needsEditApproval(session.role)
        ? await activeGradeEditApproval(supabase, assignmentId, session.uid)
        : null;
    if (assignment.status === 'completed' && needsEditApproval(session.role) && !approval) {
      return NextResponse.json({ error: EDIT_NEEDS_APPROVAL }, { status: 403 });
    }

    const graded = await scoreAssignment(supabase, assignmentId, assignment.scenario_id);
    if (graded.error) {
      console.error('Failed to score assignment', graded.error);
      return NextResponse.json({ error: 'Unable to finalize patient case' }, { status: 500 });
    }
    const { score } = graded;
    // Students read each task's overall level from here on; settle it first.
    await syncStepGradedLevels(supabase, assignmentId, graded.completions, graded.stepsByTask, session.uid);

    // Rows still waiting for a grade. A task with sub-tasks is graded once all
    // are rated, or (none rated) while a completion stands in for them; a task
    // without is graded once it has a completion.
    const { data: taskRows, error: tasksError } = await supabase
      .from('scenario_tasks')
      .select('id')
      .eq('scenario_id', assignment.scenario_id);
    if (tasksError) {
      console.error('Failed to read scenario tasks', tasksError);
      return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
    }
    const hasCompletion = new Set(graded.completions.map((c) => c.task_id));
    let remaining = 0;
    for (const { id } of taskRows ?? []) {
      const steps = graded.stepsByTask.get(id);
      if (steps && steps.total > 0) {
        if (steps.ratings.length === 0) remaining += hasCompletion.has(id) ? 0 : steps.total;
        else remaining += steps.total - steps.ratings.length;
      } else if (!hasCompletion.has(id)) {
        remaining += 1;
      }
    }

    // Not every row graded yet, and never finished: keep it open as progress.
    if (remaining > 0 && assignment.status !== 'completed') {
      const { data: progress, error: progressError } = await supabase
        .from('scenario_assignments')
        .update({ status: 'in_progress' })
        .eq('id', assignmentId)
        .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken, submitted_at, finalized_by')
        .single();
      if (progressError || !progress) {
        console.error('Failed to save grading progress', progressError);
        return NextResponse.json({ error: 'Unable to save grading progress' }, { status: 500 });
      }
      return NextResponse.json({ assignment: progress, score, completed: false, remaining });
    }

    const { data: updated, error } = await supabase
      .from('scenario_assignments')
      .update({
        status: 'completed',
        score,
        completed_at: assignment.status === 'completed' && assignment.completed_at
          ? assignment.completed_at
          : new Date().toISOString(),
        finalized_by: session.uid,
      })
      .eq('id', assignmentId)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken, submitted_at, finalized_by')
      .single();

    if (error || !updated) {
      console.error('Failed to finalize assignment', error);
      return NextResponse.json({ error: 'Unable to finalize patient case' }, { status: 500 });
    }

    if (approval) {
      await spendGradeEditApproval(supabase, approval);
      await logAudit(
        session,
        {
          action: 'grade_edit.saved',
          entityType: 'scenario_assignments',
          entityId: assignmentId,
          details: { request_id: approval.data.request_id, reason: approval.data.reason, score },
        },
        request,
      );
    }

    return NextResponse.json({ assignment: updated, score, completed: true, remaining: 0 });
  } catch (err) {
    console.error('Finalize assignment failed', err);
    return NextResponse.json({ error: 'Unable to finalize patient case' }, { status: 500 });
  }
}
