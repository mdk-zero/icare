import type { getSupabaseAdmin } from '@/app/lib/supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface ShiftGroup {
  id: string;
  name: string;
  section_id: string;
  section_name: string | null;
}

/**
 * The groups a caller may schedule a shift for: a faculty member's own
 * groups, or every group in an admin's sections (all of them when the admin
 * has no scope). Sorted by section, then name.
 */
export async function schedulableGroups(
  supabase: Supabase,
  session: { uid: string; role: string },
  sectionIds: string[] | null,
): Promise<ShiftGroup[]> {
  let query = supabase.from('teams').select('id, name, section_id, faculty_id, sections(name)');
  if (session.role === 'faculty') query = query.eq('faculty_id', session.uid);
  else if (sectionIds !== null) {
    if (sectionIds.length === 0) return [];
    query = query.in('section_id', sectionIds);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Failed to load groups for shifts', error);
    return [];
  }
  return (data ?? [])
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      section_id: t.section_id as string,
      section_name: (t.sections as unknown as { name?: string } | null)?.name ?? null,
    }))
    .sort(
      (a, b) =>
        (a.section_name ?? '').localeCompare(b.section_name ?? '', undefined, { numeric: true }) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
}

/**
 * Which group each shift was rostered for. A shift stores no group of its
 * own: it is the group its students share. A shift whose students span
 * several groups (one scheduled for a whole section, before shifts went by
 * group) has none.
 */
export async function groupsForShifts(
  supabase: Supabase,
  rows: { shift_id: string; student_id: string }[],
): Promise<Map<string, ShiftGroup>> {
  const out = new Map<string, ShiftGroup>();
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  if (studentIds.length === 0) return out;

  const { data, error } = await supabase
    .from('team_members')
    .select('student_id, teams(id, name, section_id, sections(name))')
    .in('student_id', studentIds);
  if (error) {
    console.error('Failed to read group membership for shifts', error);
    return out;
  }
  const groupOf = new Map<string, ShiftGroup>();
  for (const m of data ?? []) {
    const t = m.teams as unknown as {
      id: string;
      name: string;
      section_id: string;
      sections?: { name?: string } | null;
    } | null;
    if (!t) continue;
    groupOf.set(m.student_id as string, {
      id: t.id,
      name: t.name,
      section_id: t.section_id,
      section_name: t.sections?.name ?? null,
    });
  }

  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const g = groupOf.get(r.student_id);
    const set = seen.get(r.shift_id) ?? new Set<string>();
    set.add(g ? g.id : 'none');
    seen.set(r.shift_id, set);
    if (g && set.size === 1) out.set(r.shift_id, g);
  }
  for (const [shiftId, set] of seen) if (set.size !== 1 || set.has('none')) out.delete(shiftId);
  return out;
}
