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
// full credit), status -> completed. Saving again after an edit re-scores it
// and keeps the date it was first completed.
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
      return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
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

    return NextResponse.json({ assignment: updated, score });
  } catch (err) {
    console.error('Finalize assignment failed', err);
    return NextResponse.json({ error: 'Unable to finalize scenario' }, { status: 500 });
  }
}
