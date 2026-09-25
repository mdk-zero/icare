import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingTeamTables, manageableSectionIds, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

/** PUT { student_id, team_id | null }: move a student into a team, or out of every team. */
export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { student_id?: unknown; team_id?: unknown };
  try {
    body = (await request.json()) as { student_id?: unknown; team_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  const teamId = typeof body.team_id === 'string' ? body.team_id : null;
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
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
