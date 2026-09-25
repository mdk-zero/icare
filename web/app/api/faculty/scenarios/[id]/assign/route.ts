import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { isMissingTeamTables } from '@/app/lib/teams';

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

  // A group never shares one case: each member gets a different one through
  // /api/faculty/teams/[id]/assign-cases.
  if (Array.isArray(team_ids) && team_ids.length > 0) {
    return NextResponse.json(
      { error: 'Groups get a different case per member. Assign cases from the Groups page.' },
      { status: 400 },
    );
  }

  const normalizedStudentIds = Array.isArray(student_ids)
    ? [...new Set(student_ids.filter((s): s is string => typeof s === 'string'))]
    : [];
  if (normalizedStudentIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
  }

  const parsedDeadline = typeof deadline === 'string' && deadline.trim().length > 0
    ? new Date(deadline)
    : null;
  if (deadline && (parsedDeadline === null || isNaN(parsedDeadline.getTime()))) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verify the scenario exists.
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id')
      .eq('id', scenarioId)
      .maybeSingle();

    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // Faculty can only assign to students in their sections.
    if (session.role === 'faculty') {
      const rosterIds = new Set(await getFacultyStudentIds(supabase, session.uid));
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
      deadline: parsedDeadline ? parsedDeadline.toISOString() : null,
      required: typeof required === 'boolean' ? required : true,
      status: 'pending' as const,
    }));

    const { data: assignments, error } = await supabase
      .from('scenario_assignments')
      .insert(rows)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken');

    if (error) {
      console.error('Failed to assign scenario', error);
      return NextResponse.json({ error: 'Unable to assign scenario' }, { status: 500 });
    }

    return NextResponse.json({ assignments, skipped: skip.size }, { status: 201 });
  } catch (err) {
    console.error('Assign scenario failed', err);
    return NextResponse.json({ error: 'Unable to assign scenario' }, { status: 500 });
  }
}
