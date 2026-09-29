import type { getSupabaseAdmin } from './supabase/server';
import { getScopedSectionIds } from './admin-scope';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Who may see and manage which shifts (migration 064).
 *
 * A shift rosters one group. An instructor manages the shifts of the groups
 * they supervise, plus any older section-wide shift (team_id null) in one of
 * their sections. A dean manages every shift in their sections.
 *
 * Before 064 there is no team_id column, so every shift is section-wide and
 * the section rule is all there is.
 */

export const SHIFT_COLUMNS =
  'id, section_id, team_id, room_id, label, shift_type, starts_at, ends_at, notes, status, created_at, section:sections(id, name), team:teams(id, name), room:rooms(id, name, room_number)';

/** The same columns before migration 064. */
export const LEGACY_SHIFT_COLUMNS =
  'id, section_id, room_id, label, shift_type, starts_at, ends_at, notes, status, created_at, section:sections(id, name), room:rooms(id, name, room_number)';

/** Postgres/PostgREST codes for a missing column or relationship (064 not applied). */
export function isMissingTeamColumn(error: { code?: string } | null): boolean {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST100'
  );
}

export interface ShiftScope {
  /** Sections the caller may see, or null for no limit. */
  sectionIds: string[] | null;
  /** Groups the caller may schedule for, or null for every group. */
  teamIds: string[] | null;
  /** Instructors only see group shifts that are theirs. */
  groupsOnly: boolean;
}

export async function getShiftScope(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<ShiftScope> {
  const sectionIds = await getScopedSectionIds(supabase, session);

  if (session.role === 'faculty') {
    const { data } = await supabase.from('teams').select('id').eq('faculty_id', session.uid);
    return { sectionIds, teamIds: (data ?? []).map((t) => t.id as string), groupsOnly: true };
  }

  if (sectionIds === null) return { sectionIds, teamIds: null, groupsOnly: false };
  const { data } = sectionIds.length
    ? await supabase.from('teams').select('id').in('section_id', sectionIds)
    : { data: [] };
  return { sectionIds, teamIds: (data ?? []).map((t) => t.id as string), groupsOnly: false };
}

/** Whether a loaded shift is one the caller may see and manage. */
export function shiftInScope(
  scope: ShiftScope,
  shift: { section_id: string | null; team_id?: string | null },
): boolean {
  if (shift.team_id) {
    if (scope.groupsOnly) return scope.teamIds?.includes(shift.team_id) ?? false;
    return scope.teamIds === null || scope.teamIds.includes(shift.team_id);
  }
  if (scope.sectionIds === null) return true;
  return !!shift.section_id && scope.sectionIds.includes(shift.section_id);
}

/** A group the caller may schedule for, with its section, or null. */
export async function loadSchedulableTeam(
  supabase: Supabase,
  scope: ShiftScope,
  teamId: string,
): Promise<{ id: string; name: string; section_id: string } | null> {
  if (scope.teamIds !== null && !scope.teamIds.includes(teamId)) return null;
  const { data } = await supabase
    .from('teams')
    .select('id, name, section_id')
    .eq('id', teamId)
    .maybeSingle();
  return (data as { id: string; name: string; section_id: string } | null) ?? null;
}

/** The students in a group, who make up its shift roster. */
export async function teamStudentIds(supabase: Supabase, teamId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('student_id, users!inner(role)')
    .eq('team_id', teamId)
    .eq('users.role', 'student');
  if (error) {
    console.error('Failed to read the group members', error);
    throw new Error('Unable to read the group members');
  }
  return [...new Set((data ?? []).map((r) => r.student_id as string))];
}
