import type { getSupabaseAdmin } from './supabase/server';
import { getFacultySectionIds } from './roster';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Teams group a section's students for assigning. A team is only a label:
 * assigning a scenario to one gives each member their own assignment, graded
 * on their own. A student is in at most one team.
 */

export const TEAMS_NEED_MIGRATION = 'Teams need database migration 048 (teams) applied first.';

/** Before migration 048 the tables don't exist (42P01 from Postgres, PGRST205 from PostgREST). */
export function isMissingTeamTables(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204';
}

export const MAX_TEAM_NAME = 60;
export const MAX_TEAMS_PER_SECTION = 20;

/** The sections a caller may manage teams in: their own, or every section for an admin. */
export async function manageableSectionIds(supabase: Supabase, role: string, uid: string): Promise<string[]> {
  if (role === 'admin') {
    const { data } = await supabase.from('sections').select('id');
    return (data ?? []).map((s) => s.id as string);
  }
  return getFacultySectionIds(supabase, uid);
}

export interface TeamMember {
  id: string;
  name: string;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
}

export interface TeamRow {
  id: string;
  section_id: string;
  name: string;
  /** The faculty member supervising the group; null before migration 051 or when unassigned. */
  faculty_id: string | null;
  faculty_name: string | null;
  members: TeamMember[];
}

/** Migration 051 adds teams.faculty_id; until then groups simply have no supervisor. */
export const TEAM_FACULTY_NEEDS_MIGRATION =
  'Assigning faculty to groups needs database migration 051 (team_faculty) applied first.';

/** Every team in the given sections with its members, and each student's team. */
export async function loadTeams(
  supabase: Supabase,
  sectionIds: string[],
): Promise<{ teams: TeamRow[]; teamOf: Map<string, string>; error: { code?: string; message?: string } | null }> {
  const teamOf = new Map<string, string>();
  if (sectionIds.length === 0) return { teams: [], teamOf, error: null };

  type TeamBase = { id: string; section_id: string; name: string; faculty_id?: string | null };
  let teams: TeamBase[] | null = null;
  let error: { code?: string; message?: string } | null = null;
  ({ data: teams, error } = await supabase
    .from('teams')
    .select('id, section_id, name, faculty_id')
    .in('section_id', sectionIds)
    .order('name'));
  // Before migration 051 there is no faculty column; read the groups without it.
  if (error?.code === '42703') {
    ({ data: teams, error } = await supabase
      .from('teams')
      .select('id, section_id, name')
      .in('section_id', sectionIds)
      .order('name'));
  }
  if (error) return { teams: [], teamOf, error };
  const ids = (teams ?? []).map((t) => t.id as string);
  if (ids.length === 0) return { teams: [], teamOf, error: null };

  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('team_id, users(id, name, picture_url, sex)')
    .in('team_id', ids);
  if (membersError) return { teams: [], teamOf, error: membersError };

  const facultyIds = [...new Set((teams ?? []).map((t) => t.faculty_id).filter((id): id is string => !!id))];
  const facultyName = new Map<string, string>();
  if (facultyIds.length > 0) {
    const { data: faculty } = await supabase.from('users').select('id, name').in('id', facultyIds);
    for (const f of faculty ?? []) facultyName.set(f.id as string, f.name as string);
  }

  const byTeam = new Map<string, TeamMember[]>();
  for (const row of members ?? []) {
    const user = row.users as unknown as TeamMember | null;
    if (!user) continue;
    teamOf.set(user.id, row.team_id as string);
    byTeam.set(row.team_id as string, [...(byTeam.get(row.team_id as string) ?? []), user]);
  }
  return {
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      section_id: t.section_id,
      name: t.name,
      faculty_id: t.faculty_id ?? null,
      faculty_name: t.faculty_id ? (facultyName.get(t.faculty_id) ?? null) : null,
      members: (byTeam.get(t.id as string) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    })),
    teamOf,
    error: null,
  };
}

/** Sort teams "Team 2" before "Team 10". */
export function compareTeamNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** A team the caller may manage, or null. */
export async function manageableTeam(
  supabase: Supabase,
  role: string,
  uid: string,
  teamId: string,
): Promise<{ id: string; section_id: string; name: string } | null> {
  const { data } = await supabase.from('teams').select('id, section_id, name').eq('id', teamId).maybeSingle();
  if (!data) return null;
  const allowed = await manageableSectionIds(supabase, role, uid);
  return allowed.includes(data.section_id as string) ? (data as { id: string; section_id: string; name: string }) : null;
}
