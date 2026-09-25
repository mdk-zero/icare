import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { isMissingTeamTables, manageableSectionIds, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

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

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const directIds = strings(student_ids);
  const teamIds = strings(team_ids);
  if (directIds.length === 0 && teamIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one student or team' }, { status: 400 });
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

    // A team stands for its members; each gets their own assignment, labelled
    // with the team it came through.
    const teamOf = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, section_id, team_members(student_id)')
        .in('id', teamIds);
      if (teamsError) {
        if (isMissingTeamTables(teamsError)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
        console.error('Failed to read teams', teamsError);
        return NextResponse.json({ error: 'Unable to assign scenario' }, { status: 500 });
      }
      const allowed = new Set(await manageableSectionIds(supabase, session.role, session.uid));
      if ((teams ?? []).length !== teamIds.length || (teams ?? []).some((t) => !allowed.has(t.section_id as string))) {
        return NextResponse.json({ error: 'Some teams are not in your sections' }, { status: 403 });
      }
      for (const team of teams ?? []) {
        for (const m of (team.team_members ?? []) as { student_id: string }[]) teamOf.set(m.student_id, team.id as string);
      }
    }
    const normalizedStudentIds = [...new Set([...directIds, ...teamOf.keys()])];
    if (normalizedStudentIds.length === 0) {
      return NextResponse.json({ error: 'The chosen teams have no members yet' }, { status: 400 });
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
