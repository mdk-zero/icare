import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIdSet, scenarioVisibleToFaculty } from '@/app/lib/scenario-visibility';
import { distributeCases } from '@/app/lib/group-distribution';
import { isMissingTeamTables, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Give a group its cases: each member gets a different scenario (and so a
 * different patient) from the chosen pool, never one they already have.
 * Every member is still assessed on their own assignment.
 *
 * `preview: true` returns who would get what without writing anything, so the
 * faculty member can check the split before confirming. The split is
 * deterministic, so the confirm writes exactly what the preview showed.
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
  const { scenario_ids, deadline, required, preview } = body as {
    scenario_ids?: unknown;
    deadline?: unknown;
    required?: unknown;
    preview?: unknown;
  };

  const scenarioIds = Array.isArray(scenario_ids)
    ? [...new Set(scenario_ids.filter((s): s is string => typeof s === 'string'))]
    : [];
  if (scenarioIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one case' }, { status: 400 });
  }
  const isPreview = preview === true;
  const parsedDeadline =
    typeof deadline === 'string' && deadline.trim().length > 0 ? new Date(deadline) : null;
  if (parsedDeadline && isNaN(parsedDeadline.getTime())) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }
  if (!isPreview && !parsedDeadline) {
    return NextResponse.json({ error: 'Set a deadline' }, { status: 400 });
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
      return NextResponse.json({ error: 'Unable to assign cases' }, { status: 500 });
    }
    const members = (memberRows ?? [])
      .map((m) => m.users as unknown as { id: string; name: string } | null)
      .filter((u): u is { id: string; name: string } => !!u)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (members.length === 0) {
      return NextResponse.json({ error: 'This group has no members yet' }, { status: 400 });
    }

    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, patient_id, patients(name)')
      .in('id', scenarioIds);
    if (scenariosError) {
      console.error('Failed to read scenarios', scenariosError);
      return NextResponse.json({ error: 'Unable to assign cases' }, { status: 500 });
    }
    if ((scenarios ?? []).length !== scenarioIds.length) {
      return NextResponse.json({ error: 'Some cases no longer exist' }, { status: 404 });
    }

    // Everyone's existing assignments of these cases: for the history rule,
    // and for the faculty visibility rule (a case in another faculty's hands
    // is not theirs to hand out).
    const { data: existing, error: existingError } = await supabase
      .from('scenario_assignments')
      .select('scenario_id, student_id')
      .in('scenario_id', scenarioIds);
    if (existingError) {
      console.error('Failed to read assignments', existingError);
      return NextResponse.json({ error: 'Unable to assign cases' }, { status: 500 });
    }

    if (session.role === 'faculty') {
      const roster = await getFacultyStudentIdSet(supabase, session.uid);
      if (members.some((m) => !roster.has(m.id))) {
        return NextResponse.json({ error: 'This group is not in your sections' }, { status: 403 });
      }
      const hidden = scenarioIds.filter(
        (sid) =>
          !scenarioVisibleToFaculty(
            (existing ?? []).filter((a) => a.scenario_id === sid).map((a) => a.student_id as string),
            roster,
          ),
      );
      if (hidden.length > 0) {
        return NextResponse.json({ error: 'Some cases belong to another faculty member' }, { status: 403 });
      }
    }

    if (scenarioIds.length < members.length) {
      return NextResponse.json(
        {
          error: `Pick at least ${members.length} cases so each of the ${members.length} members gets a different one.`,
        },
        { status: 400 },
      );
    }

    const memberIds = new Set(members.map((m) => m.id));
    const history = new Map<string, Set<string>>();
    for (const a of existing ?? []) {
      const sid = a.student_id as string;
      if (!memberIds.has(sid)) continue;
      history.set(sid, (history.get(sid) ?? new Set()).add(a.scenario_id as string));
    }

    const { assignment, unplaced } = distributeCases(
      members.map((m) => m.id),
      scenarioIds,
      history,
    );
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    if (unplaced.length > 0) {
      return NextResponse.json(
        {
          error: `No unused case left for ${unplaced.map((id) => nameOf.get(id)).join(', ')}. Add cases they haven't had.`,
          unplaced,
        },
        { status: 400 },
      );
    }

    const scenarioById = new Map(
      (scenarios ?? []).map((s) => [
        s.id as string,
        {
          title: s.title as string,
          patient_name: (s.patients as unknown as { name: string } | null)?.name ?? null,
        },
      ]),
    );
    const plan = members.map((m) => {
      const sid = assignment.get(m.id)!;
      return {
        student_id: m.id,
        student_name: m.name,
        scenario_id: sid,
        scenario_title: scenarioById.get(sid)?.title ?? '',
        patient_name: scenarioById.get(sid)?.patient_name ?? null,
      };
    });

    if (isPreview) return NextResponse.json({ plan });

    const rows = plan.map((p) => ({
      scenario_id: p.scenario_id,
      student_id: p.student_id,
      team_id: teamId,
      assigned_by: session.uid,
      deadline: parsedDeadline!.toISOString(),
      required: typeof required === 'boolean' ? required : true,
      status: 'pending' as const,
    }));
    const { error: insertError } = await supabase.from('scenario_assignments').insert(rows);
    if (insertError) {
      console.error('Failed to assign group cases', insertError);
      return NextResponse.json({ error: 'Unable to assign cases' }, { status: 500 });
    }
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    console.error('Assign group cases failed', err);
    return NextResponse.json({ error: 'Unable to assign cases' }, { status: 500 });
  }
}
