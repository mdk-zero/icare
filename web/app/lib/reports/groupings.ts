import type { getSupabaseAdmin } from '@/app/lib/supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface Grouping {
  teamId: string | null;
  /** "BSN 1101 · Group A", or the section alone for a student in no group. */
  groupLabel: string;
  /** Just the group's name, or null for a student in none. */
  groupName: string | null;
  sectionName: string | null;
}

/**
 * Each student's group now (team_members), with its section. A student in no
 * group reads under their own section, so a label is always something.
 */
export async function loadGroupings(
  supabase: Supabase,
  students: readonly { id: string; section_id: string | null }[],
): Promise<Map<string, Grouping>> {
  const out = new Map<string, Grouping>();
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return out;

  const { data: memberships } = await supabase.from('team_members').select('student_id, team_id').in('student_id', ids);
  const teamOf = new Map(((memberships ?? []) as { student_id: string; team_id: string }[]).map((m) => [m.student_id, m.team_id]));
  const teamIds = [...new Set(teamOf.values())];
  const { data: teams } = teamIds.length
    ? await supabase.from('teams').select('id, name, section_id').in('id', teamIds)
    : { data: [] as { id: string; name: string; section_id: string }[] };
  const teamById = new Map(((teams ?? []) as { id: string; name: string; section_id: string }[]).map((t) => [t.id, t]));
  const sectionIds = [
    ...new Set([...students.map((s) => s.section_id), ...[...teamById.values()].map((t) => t.section_id)].filter((x): x is string => !!x)),
  ];
  const { data: sections } = sectionIds.length
    ? await supabase.from('sections').select('id, name').in('id', sectionIds)
    : { data: [] as { id: string; name: string }[] };
  const sectionName = new Map(((sections ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  for (const s of students) {
    const team = teamById.get(teamOf.get(s.id) ?? '');
    const section = sectionName.get(team?.section_id ?? s.section_id ?? '') ?? null;
    out.set(s.id, {
      teamId: team?.id ?? null,
      groupName: team?.name ?? null,
      sectionName: section,
      groupLabel: team ? [section, team.name].filter(Boolean).join(' · ') : (section ?? 'No group'),
    });
  }
  return out;
}
