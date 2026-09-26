import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIdSet, scenarioVisibleToFaculty } from '@/app/lib/scenario-visibility';
import { isMissingTeamTables, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Give a group its case: one scenario for the whole group. Every member gets
 * their own assignment of it, so each works it and is graded on their own.
 * Members who already have the case keep what they have and are left out.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: teamId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { scenario_id, deadline, required } = body as {
    scenario_id?: unknown;
    deadline?: unknown;
    required?: unknown;
  };

  if (typeof scenario_id !== 'string' || scenario_id.length === 0) {
    return NextResponse.json({ error: 'Choose a case' }, { status: 400 });
  }
  const parsedDeadline =
    typeof deadline === 'string' && deadline.trim().length > 0 ? new Date(deadline) : null;
  if (!parsedDeadline) return NextResponse.json({ error: 'Set a deadline' }, { status: 400 });
  if (isNaN(parsedDeadline.getTime())) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const team = await manageableTeam(supabase, session.role, session.uid, teamId);
    if (!team) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const { data: memberRows, error: membersError } = await supabase
      .from('team_members')
      .select('student_id, users(id, name)')
      .eq('team_id', teamId);
    if (membersError) {
      if (isMissingTeamTables(membersError)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
      console.error('Failed to read group members', membersError);
      return NextResponse.json({ error: 'Unable to assign the case' }, { status: 500 });
    }
    const members = (memberRows ?? [])
      .map((m) => m.users as unknown as { id: string; name: string } | null)
      .filter((u): u is { id: string; name: string } => !!u)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (members.length === 0) {
      return NextResponse.json({ error: 'This group has no members yet' }, { status: 400 });
    }

    const { data: scenario, error: scenarioError } = await supabase
      .from('scenarios')
      .select('id, title')
      .eq('id', scenario_id)
      .maybeSingle();
    if (scenarioError) {
      console.error('Failed to read scenario', scenarioError);
      return NextResponse.json({ error: 'Unable to assign the case' }, { status: 500 });
    }
    if (!scenario) return NextResponse.json({ error: 'That case no longer exists' }, { status: 404 });

    // Everyone's existing assignments of this case: to skip members who have
    // it, and for the faculty visibility rule (a case in another faculty's
    // hands is not theirs to hand out).
    const { data: existing, error: existingError } = await supabase
      .from('scenario_assignments')
      .select('student_id')
      .eq('scenario_id', scenario_id);
    if (existingError) {
      console.error('Failed to read assignments', existingError);
      return NextResponse.json({ error: 'Unable to assign the case' }, { status: 500 });
    }
    const holders = (existing ?? []).map((a) => a.student_id as string);

    if (session.role === 'faculty') {
      const roster = await getFacultyStudentIdSet(supabase, session.uid);
      if (members.some((m) => !roster.has(m.id))) {
        return NextResponse.json({ error: 'This group is not in your sections' }, { status: 403 });
      }
      if (!scenarioVisibleToFaculty(holders, roster)) {
        return NextResponse.json({ error: 'This case belongs to another faculty member' }, { status: 403 });
      }
    }

    const had = new Set(holders);
    const toAssign = members.filter((m) => !had.has(m.id));
    const skipped = members.filter((m) => had.has(m.id));
    if (toAssign.length === 0) {
      return NextResponse.json({ error: 'Every member of this group already has this case' }, { status: 409 });
    }

    const { error: insertError } = await supabase.from('scenario_assignments').insert(
      toAssign.map((m) => ({
        scenario_id,
        student_id: m.id,
        team_id: teamId,
        assigned_by: session.uid,
        deadline: parsedDeadline.toISOString(),
        required: typeof required === 'boolean' ? required : true,
        status: 'pending' as const,
      })),
    );
    if (insertError) {
      console.error('Failed to assign group case', insertError);
      return NextResponse.json({ error: 'Unable to assign the case' }, { status: 500 });
    }
    return NextResponse.json(
      {
        scenario_title: scenario.title as string,
        assigned: toAssign.map((m) => m.name),
        skipped: skipped.map((m) => m.name),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Assign group case failed', err);
    return NextResponse.json({ error: 'Unable to assign the case' }, { status: 500 });
  }
}
