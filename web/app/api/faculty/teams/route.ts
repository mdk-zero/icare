import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  compareTeamNames,
  isMissingTeamTables,
  loadTeams,
  manageableSectionIds,
  MAX_TEAM_NAME,
  MAX_TEAMS_PER_SECTION,
  TEAMS_NEED_MIGRATION,
} from '@/app/lib/teams';

/**
 * GET: the caller's sections, their students, and the teams in them.
 *   { sections: [{ id, name }], teams: [...], students: [{ id, name, section_id, team_id, ... }], enabled }
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const sectionIds = await manageableSectionIds(supabase, session.role, session.uid);
  const [{ data: sections }, { data: students }] = await Promise.all([
    sectionIds.length
      ? supabase.from('sections').select('id, name').in('id', sectionIds).order('name')
      : Promise.resolve({ data: [] }),
    sectionIds.length
      ? supabase
          .from('users')
          .select('id, name, picture_url, sex, section_id')
          .eq('role', 'student')
          .in('section_id', sectionIds)
          .order('name')
          .limit(5000)
      : Promise.resolve({ data: [] }),
  ]);

  const loaded = await loadTeams(supabase, sectionIds);
  if (loaded.error && !isMissingTeamTables(loaded.error)) {
    console.error('Failed to load teams', loaded.error);
    return NextResponse.json({ error: 'Unable to load teams' }, { status: 500 });
  }
  return NextResponse.json({
    enabled: !loaded.error,
    sections: sections ?? [],
    teams: loaded.teams.sort((a, b) => compareTeamNames(a.name, b.name)),
    students: (students ?? []).map((s) => ({ ...s, team_id: loaded.teamOf.get(s.id as string) ?? null })),
  });
}

/** POST { section_id, name }: create a team. */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { section_id?: unknown; name?: unknown };
  try {
    body = (await request.json()) as { section_id?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_TEAM_NAME) {
    return NextResponse.json({ error: `Team name must be 1–${MAX_TEAM_NAME} characters` }, { status: 400 });
  }
  const sectionId = typeof body.section_id === 'string' ? body.section_id : '';

  const supabase = getSupabaseAdmin();
  const allowed = await manageableSectionIds(supabase, session.role, session.uid);
  if (!allowed.includes(sectionId)) return NextResponse.json({ error: 'Not one of your sections' }, { status: 403 });

  const { count } = await supabase.from('teams').select('id', { count: 'exact', head: true }).eq('section_id', sectionId);
  if ((count ?? 0) >= MAX_TEAMS_PER_SECTION) {
    return NextResponse.json({ error: `A section can have at most ${MAX_TEAMS_PER_SECTION} teams` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({ section_id: sectionId, name, created_by: session.uid })
    .select('id, section_id, name')
    .single();
  if (error) {
    if (isMissingTeamTables(error)) return NextResponse.json({ error: TEAMS_NEED_MIGRATION }, { status: 503 });
    if (error.code === '23505') return NextResponse.json({ error: 'That section already has a team with this name' }, { status: 409 });
    console.error('Failed to create team', error);
    return NextResponse.json({ error: 'Unable to create team' }, { status: 500 });
  }
  return NextResponse.json({ team: { ...data, members: [] } }, { status: 201 });
}
