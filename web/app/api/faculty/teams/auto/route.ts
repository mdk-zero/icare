import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  compareTeamNames,
  isMissingTeamTables,
  manageableSectionIds,
  MAX_TEAMS_PER_SECTION,
  TEAMS_NEED_MIGRATION,
} from '@/app/lib/teams';
import { nextGroupName } from '@/app/lib/group-label';

/**
 * POST { section_id, count }: split the section's students into `count`
 * groups at random, as evenly as possible. Existing groups are reused in name
 * order (keeping their names and supervising faculty) and "Group A", "Group B"… are created
 * for any missing. Groups past `count` are deleted, since regrouping leaves
 * them empty; scenarios assigned through them stay, just without the label.
 * Everyone in the section is reshuffled.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Groups are built by admins; faculty only see the ones assigned to them.
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { section_id?: unknown; count?: unknown };
  try {
    body = (await request.json()) as { section_id?: unknown; count?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const sectionId = typeof body.section_id === 'string' ? body.section_id : '';
  const count = typeof body.count === 'number' ? Math.floor(body.count) : NaN;
  if (!(count >= 1 && count <= MAX_TEAMS_PER_SECTION)) {
    return NextResponse.json({ error: `Choose between 1 and ${MAX_TEAMS_PER_SECTION} teams` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const allowed = await manageableSectionIds(supabase, session.role, session.uid);
  if (!allowed.includes(sectionId)) return NextResponse.json({ error: 'Not one of your sections' }, { status: 403 });

  const [{ data: students }, { data: existing, error: teamsError }] = await Promise.all([
    supabase.from('users').select('id').eq('role', 'student').eq('section_id', sectionId).limit(5000),
    supabase.from('teams').select('id, name').eq('section_id', sectionId),
  ]);
  if (teamsError) {
    if (isMissingTeamTables(teamsError)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
    return NextResponse.json({ error: 'Unable to split teams' }, { status: 500 });
  }
  const studentIds = (students ?? []).map((s) => s.id as string);
  if (studentIds.length < count) {
    return NextResponse.json({ error: `The section has only ${studentIds.length} students` }, { status: 400 });
  }

  const teams = [...(existing ?? [])].sort((a, b) => compareTeamNames(a.name, b.name)) as { id: string; name: string }[];
  const names = new Set(teams.map((t) => t.name));
  while (teams.length < count) {
    const name = nextGroupName(names);
    const { data, error } = await supabase
      .from('teams')
      .insert({ section_id: sectionId, name, created_by: session.uid })
      .select('id, name')
      .single();
    if (error || !data) {
      console.error('Failed to create team', error);
      return NextResponse.json({ error: 'Unable to split teams' }, { status: 500 });
    }
    teams.push(data as { id: string; name: string });
    names.add(name);
  }
  const targets = teams.slice(0, count);

  // Fisher–Yates, then deal round-robin.
  const shuffled = [...studentIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rows = shuffled.map((studentId, i) => ({ team_id: targets[i % count].id, student_id: studentId }));

  const { error: clearError } = await supabase.from('team_members').delete().in('student_id', studentIds);
  if (clearError) {
    console.error('Failed to clear team memberships', clearError);
    return NextResponse.json({ error: 'Unable to split teams' }, { status: 500 });
  }
  const { error: insertError } = await supabase.from('team_members').insert(rows);
  if (insertError) {
    console.error('Failed to add team members', insertError);
    return NextResponse.json({ error: 'Unable to split teams' }, { status: 500 });
  }
  const extra = teams.slice(count).map((t) => t.id);
  if (extra.length > 0) {
    const { error: pruneError } = await supabase.from('teams').delete().in('id', extra);
    if (pruneError) console.error('Failed to remove extra groups', pruneError);
  }
  return NextResponse.json({ teams: targets.length, students: rows.length });
}
