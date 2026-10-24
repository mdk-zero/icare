import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { scenarioInDeanScope } from '@/app/lib/scenario-visibility';
import { isMissingTeamTables } from '@/app/lib/teams';
import { parseDeadline } from '@/app/lib/deadline-input';
import { notifyCaseAssigned } from '@/app/lib/notify-case-assigned';
import { isReturnDemo } from '@/app/lib/scenario-kind';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: scenarioId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_ids, team_ids, deadline, required } = body as {
    student_ids?: unknown;
    team_ids?: unknown;
    deadline?: unknown;
    required?: unknown;
  };

  // A group's case is given through /api/faculty/teams/[id]/assign-cases,
  // which tags every member's assignment with the group.
  if (Array.isArray(team_ids) && team_ids.length > 0) {
    return NextResponse.json(
      { error: 'Give a group its case with Assign case on the Groups page.' },
      { status: 400 },
    );
  }

  const normalizedStudentIds = Array.isArray(student_ids)
    ? [...new Set(student_ids.filter((s): s is string => typeof s === 'string'))]
    : [];
  if (normalizedStudentIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
  }

  // Every activity has a deadline: it is what late and overdue work is measured against.
  const deadlineCheck = parseDeadline(deadline);
  if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });
  const parsedDeadline = new Date(deadlineCheck.value as string);

  try {
    const supabase = getSupabaseAdmin();

    // Verify the scenario exists.
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id, title, patient_id')
      .eq('id', scenarioId)
      .maybeSingle();

    // A Return Demonstration (072) is assigned from its own page, and
    // another Dean's case (077) is not found at all.
    if (!scenario || (await isReturnDemo(supabase, scenarioId)) || !(await scenarioInDeanScope(supabase, session, scenarioId))) {
      return NextResponse.json({ error: 'Patient case not found' }, { status: 404 });
    }

    // Faculty can only assign to students in their sections, an admin to
    // their own students.
    const scopedIds = await getScopedStudentIds(supabase, session);
    if (scopedIds) {
      const rosterIds = new Set(scopedIds);
      const invalid = normalizedStudentIds.filter((sid) => !rosterIds.has(sid));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: 'Some students are not in your sections', invalid },
          { status: 403 },
        );
      }
    }

    // Anyone who already has this scenario keeps their assignment.
    const { data: already } = await supabase
      .from('scenario_assignments')
      .select('student_id')
      .eq('scenario_id', scenarioId)
      .in('student_id', normalizedStudentIds);
    const skip = new Set((already ?? []).map((a) => a.student_id as string));
    const toAssign = normalizedStudentIds.filter((sid) => !skip.has(sid));
    if (toAssign.length === 0) {
      return NextResponse.json({ assignments: [], skipped: skip.size }, { status: 200 });
    }

    // Label each row with the student's current group, so review and results
    // can show the group the work was done in.
    const teamOf = new Map<string, string>();
    const { data: memberships, error: membershipError } = await supabase
      .from('team_members')
      .select('student_id, team_id')
      .in('student_id', toAssign);
    if (membershipError && !isMissingTeamTables(membershipError)) {
      console.error('Failed to read group memberships', membershipError);
    }
    for (const m of memberships ?? []) teamOf.set(m.student_id as string, m.team_id as string);

    const rows = toAssign.map((studentId) => ({
      scenario_id: scenarioId,
      student_id: studentId,
      ...(teamOf.has(studentId) ? { team_id: teamOf.get(studentId) } : {}),
      assigned_by: session.uid,
      deadline: parsedDeadline.toISOString(),
      required: typeof required === 'boolean' ? required : true,
      status: 'pending' as const,
    }));

    const { data: assignments, error } = await supabase
      .from('scenario_assignments')
      .insert(rows)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken');

    if (error) {
      console.error('Failed to assign patient case', error);
      return NextResponse.json({ error: 'Unable to assign patient case' }, { status: 500 });
    }

    await notifyCaseAssigned(
      supabase,
      { id: scenario.id as string, title: scenario.title as string, patient_id: (scenario.patient_id as string | null) ?? null },
      (assignments ?? []).map((a) => ({ id: a.id as string, student_id: a.student_id as string })),
      parsedDeadline,
    );

    return NextResponse.json({ assignments, skipped: skip.size }, { status: 201 });
  } catch (err) {
    console.error('Assign patient case failed', err);
    return NextResponse.json({ error: 'Unable to assign patient case' }, { status: 500 });
  }
}

/**
 * Moves the date of performance for students who already have the case:
 * the "Who has it" list on the patient case card. Graded ones keep theirs.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: scenarioId } = await params;
  const body = (await request.json().catch(() => null)) as { student_ids?: unknown; deadline?: unknown } | null;
  const ids = Array.isArray(body?.student_ids)
    ? [...new Set(body.student_ids.filter((s): s is string => typeof s === 'string'))]
    : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
  const deadlineCheck = parseDeadline(body?.deadline);
  if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    if (!(await scenarioInDeanScope(supabase, session, scenarioId))) {
      return NextResponse.json({ error: 'Patient case not found' }, { status: 404 });
    }
    const scopedIds = await getScopedStudentIds(supabase, session);
    if (scopedIds) {
      const rosterIds = new Set(scopedIds);
      if (ids.some((sid) => !rosterIds.has(sid))) {
        return NextResponse.json({ error: 'Some students are not in your sections' }, { status: 403 });
      }
    }
    const { data, error } = await supabase
      .from('scenario_assignments')
      .update({ deadline: new Date(deadlineCheck.value as string).toISOString() })
      .eq('scenario_id', scenarioId)
      .in('student_id', ids)
      .neq('status', 'completed')
      .select('id');
    if (error) {
      console.error('Failed to move the date of performance', error);
      return NextResponse.json({ error: 'Unable to change the date' }, { status: 500 });
    }
    return NextResponse.json({ updated: (data ?? []).length });
  } catch (err) {
    console.error('Move date of performance failed', err);
    return NextResponse.json({ error: 'Unable to change the date' }, { status: 500 });
  }
}
