import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import type { SessionPayload } from '@/app/lib/auth/session';
import { MAX_REASON_LENGTH } from '@/app/lib/grade-edit-requests';
import { isMissingTeamTables, manageableSectionIds, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** Short enough not to be a chore, long enough that "x" isn't a reason. */
const MIN_REASON_LENGTH = 10;

/**
 * PUT { student_id, team_id | null, reason? }: move a student into a team, or
 * out of every team.
 *
 * An admin may do either freely. An instructor may only move a student
 * between two groups they supervise in the same section, and must say why:
 * the reason goes to the audit trail and to their dean.
 */
export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'faculty'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { student_id?: unknown; team_id?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { student_id?: unknown; team_id?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  const teamId = typeof body.team_id === 'string' ? body.team_id : null;
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (session.role === 'faculty') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    return moveBetweenOwnGroups(supabase, session, request, studentId, teamId, reason);
  }
  const { data: student } = await supabase
    .from('users')
    .select('id, section_id, role')
    .eq('id', studentId)
    .maybeSingle();
  const allowed = await manageableSectionIds(supabase, session.role, session.uid);
  if (!student || student.role !== 'student' || !allowed.includes(student.section_id as string)) {
    return NextResponse.json({ error: 'Student not in your sections' }, { status: 403 });
  }

  if (teamId) {
    const team = await manageableTeam(supabase, session.role, session.uid, teamId);
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    if (team.section_id !== student.section_id) {
      return NextResponse.json({ error: 'The team is in a different section' }, { status: 400 });
    }
  }

  const { error: clearError } = await supabase.from('team_members').delete().eq('student_id', studentId);
  if (clearError) {
    if (isMissingTeamTables(clearError)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
    console.error('Failed to clear team membership', clearError);
    return NextResponse.json({ error: 'Unable to move student' }, { status: 500 });
  }
  if (teamId) {
    const { error } = await supabase.from('team_members').insert({ team_id: teamId, student_id: studentId });
    if (error) {
      console.error('Failed to add team member', error);
      return NextResponse.json({ error: 'Unable to move student' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

/** An instructor's move: from one of their groups to another in the same section, with a reason. */
async function moveBetweenOwnGroups(
  supabase: Supabase,
  session: SessionPayload,
  request: NextRequest,
  studentId: string,
  teamId: string | null,
  reason: string,
) {
  if (!teamId) return NextResponse.json({ error: 'Choose the group to move them to' }, { status: 400 });
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Say why this student is moving (at least ${MIN_REASON_LENGTH} characters)` },
      { status: 400 },
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json({ error: `Keep the reason under ${MAX_REASON_LENGTH} characters` }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('student_id', studentId)
    .maybeSingle();
  if (membershipError) {
    if (isMissingTeamTables(membershipError)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
    console.error('Failed to read team membership', membershipError);
    return NextResponse.json({ error: 'Unable to move student' }, { status: 500 });
  }
  if (!membership) return NextResponse.json({ error: 'That student is not in one of your groups' }, { status: 403 });
  if (membership.team_id === teamId) {
    return NextResponse.json({ error: 'They are already in that group' }, { status: 409 });
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, section_id, faculty_id')
    .in('id', [membership.team_id as string, teamId]);
  const from = teams?.find((t) => t.id === membership.team_id);
  const to = teams?.find((t) => t.id === teamId);
  // Both ends must be the caller's own groups: a student is theirs only
  // through the group they are in, and a group they don't supervise isn't
  // theirs to fill.
  if (!from || from.faculty_id !== session.uid) {
    return NextResponse.json({ error: 'That student is not in one of your groups' }, { status: 403 });
  }
  if (!to || to.faculty_id !== session.uid) {
    return NextResponse.json({ error: 'You can only move students into groups you supervise' }, { status: 403 });
  }
  if (to.section_id !== from.section_id) {
    return NextResponse.json({ error: 'The group is in a different section' }, { status: 400 });
  }

  const { error } = await supabase.from('team_members').update({ team_id: teamId }).eq('student_id', studentId);
  if (error) {
    console.error('Failed to move team member', error);
    return NextResponse.json({ error: 'Unable to move student' }, { status: 500 });
  }

  const [{ data: me }, { data: student }, { data: section }] = await Promise.all([
    supabase.from('users').select('name, admin_id').eq('id', session.uid).single(),
    supabase.from('users').select('name').eq('id', studentId).single(),
    supabase.from('sections').select('name').eq('id', from.section_id).maybeSingle(),
  ]);

  // Their own dean (053); every dean when they have none. The move has
  // already happened, so a failed notice is logged rather than undone.
  let deans: string[] = [];
  if (me?.admin_id) {
    const { data: admin } = await supabase.from('users').select('id').eq('id', me.admin_id).eq('role', 'admin').maybeSingle();
    if (admin) deans = [admin.id as string];
  }
  if (deans.length === 0) {
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
    deans = (admins ?? []).map((a) => a.id as string);
  }
  const facultyName = me?.name ?? session.email;
  const studentName = student?.name ?? 'A student';
  const where = section?.name ? `${section.name} · ` : '';
  if (deans.length > 0) {
    const { error: notifyError } = await supabase.from('notifications').insert(
      deans.map((user_id) => ({
        user_id,
        type: 'system',
        title: 'Student moved between groups',
        body: `${facultyName} moved ${studentName} from ${where}${from.name} to ${where}${to.name}. Reason: ${reason}`,
        data: { kind: 'team_member_move', student_id: studentId, from_team_id: from.id, to_team_id: to.id },
      })),
    );
    if (notifyError) console.error('Failed to notify the dean of a group move', notifyError);
  }

  await logAudit(
    session,
    {
      action: 'team.member_move',
      entityType: 'team_members',
      entityId: studentId,
      details: {
        message: `Moved ${studentName} from ${where}${from.name} to ${where}${to.name}. Reason: ${reason}`,
        student_name: studentName,
        section_id: from.section_id,
        from_team_id: from.id,
        from_team: from.name,
        to_team_id: to.id,
        to_team: to.name,
        reason,
      },
    },
    request,
  );

  return NextResponse.json({ ok: true });
}
