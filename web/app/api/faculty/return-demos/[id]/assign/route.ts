import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { parseDeadline } from '@/app/lib/deadline-input';
import { notifyReturnDemoAssigned } from '@/app/lib/notify-case-assigned';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { isMissingTeamTables, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';
import { mergeAssignees } from '@/app/lib/return-demos';
import { canEdit, loadReturnDemo } from '@/app/lib/return-demos-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ids = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0))] : [];

/**
 * POST { team_ids?, student_ids?, deadline, required? }: give a Return
 * Demonstration to whole groups and/or single students. Each student gets
 * their own assignment and is graded on their own; group members are tagged
 * with the group, a student picked by name with their own group. Anyone who
 * already has it is skipped.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const teamIds = ids(body.team_ids);
  const studentIds = ids(body.student_ids);
  if (teamIds.length === 0 && studentIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one group or student' }, { status: 400 });
  }
  // Every activity has a deadline: it is what attendance is measured against.
  const deadline = parseDeadline(body.deadline);
  if (!deadline.ok) return NextResponse.json({ error: deadline.error }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadReturnDemo(supabase, session, id);
    if ('response' in loaded) return loaded.response;
    // Only its maker gives it out, so nobody else can take one over.
    if (!canEdit(session, loaded.demo)) {
      return NextResponse.json({ error: 'Only its maker can assign this Return Demonstration' }, { status: 403 });
    }

    // The groups: an instructor's must be ones they supervise.
    const teamMembers = new Map<string, string[]>();
    if (teamIds.length > 0) {
      const { data: teams, error } = await supabase.from('teams').select('id, faculty_id').in('id', teamIds);
      if (error) {
        if (isMissingTeamTables(error)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
        throw error;
      }
      for (const teamId of teamIds) {
        const team = (teams ?? []).find((t) => t.id === teamId);
        const allowed =
          team &&
          (session.role === 'faculty'
            ? team.faculty_id === session.uid
            : Boolean(await manageableTeam(supabase, session.role, session.uid, teamId)));
        if (!allowed) return NextResponse.json({ error: 'You can only assign your own groups' }, { status: 403 });
      }
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('team_id, student_id')
        .in('team_id', teamIds);
      if (membersError) throw membersError;
      for (const teamId of teamIds) teamMembers.set(teamId, []);
      for (const m of members ?? []) teamMembers.get(m.team_id as string)?.push(m.student_id as string);
    }

    // Each student picked by name is tagged with their own group, if any.
    const teamOf = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: memberships, error } = await supabase.from('team_members').select('student_id, team_id').in('student_id', studentIds);
      if (error && !isMissingTeamTables(error)) throw error;
      for (const m of memberships ?? []) teamOf.set(m.student_id as string, m.team_id as string);
    }

    const { data: holders, error: holdersError } = await supabase.from('scenario_assignments').select('student_id').eq('scenario_id', id);
    if (holdersError) throw holdersError;
    const { rows, skipped } = mergeAssignees({
      teamMembers,
      studentIds,
      teamOf,
      already: new Set((holders ?? []).map((h) => h.student_id as string)),
    });

    // An instructor's own group members; an admin's own students (077).
    const scopedIds = await getScopedStudentIds(supabase, session);
    if (scopedIds) {
      const roster = new Set(scopedIds);
      if (rows.some((r) => !roster.has(r.student_id))) {
        return NextResponse.json({ error: 'Some students are not in your groups' }, { status: 403 });
      }
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Everyone chosen already has this Return Demonstration' }, { status: 409 });
    }

    const required = typeof body.required === 'boolean' ? body.required : true;
    const { data: inserted, error: insertError } = await supabase.from('scenario_assignments').insert(
      rows.map((r) => ({
        scenario_id: id,
        student_id: r.student_id,
        ...(r.team_id ? { team_id: r.team_id } : {}),
        assigned_by: session.uid,
        deadline: deadline.value as string,
        required,
        status: 'pending' as const,
      })),
    ).select('id, student_id');
    if (insertError) throw insertError;

    // Each student hears about it, on their phone too.
    await notifyReturnDemoAssigned(
      supabase,
      { id, title: loaded.demo.title },
      ((inserted ?? []) as { id: string; student_id: string }[]),
      new Date(deadline.value as string),
    );

    await logAudit(
      session,
      {
        action: 'return_demo.assign',
        entityType: 'scenarios',
        entityId: id,
        details: { message: `Assigned Return Demonstration “${loaded.demo.title}” to ${rows.length} student(s)`, skipped, required },
      },
      request,
    );
    return NextResponse.json({ assigned: rows.length, skipped }, { status: 201 });
  } catch (err) {
    console.error('Assign Return Demonstration failed', err);
    return NextResponse.json({ error: 'Unable to assign the Return Demonstration' }, { status: 500 });
  }
}

/**
 * PATCH { student_ids, deadline }: moves the date of performance for students
 * who already have it (the card's "Who has it" list). Only its maker does;
 * graded students keep theirs.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const studentIds = ids(body.student_ids);
  if (studentIds.length === 0) return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
  const deadline = parseDeadline(body.deadline);
  if (!deadline.ok) return NextResponse.json({ error: deadline.error }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadReturnDemo(supabase, session, id);
    if ('response' in loaded) return loaded.response;
    if (!canEdit(session, loaded.demo)) {
      return NextResponse.json({ error: 'Only its maker can change this Return Demonstration' }, { status: 403 });
    }
    const { data, error } = await supabase
      .from('scenario_assignments')
      .update({ deadline: new Date(deadline.value as string).toISOString() })
      .eq('scenario_id', id)
      .in('student_id', studentIds)
      .neq('status', 'completed')
      .select('id');
    if (error) throw error;
    return NextResponse.json({ updated: (data ?? []).length });
  } catch (err) {
    console.error('Move Return Demonstration date failed', err);
    return NextResponse.json({ error: 'Unable to change the date' }, { status: 500 });
  }
}
