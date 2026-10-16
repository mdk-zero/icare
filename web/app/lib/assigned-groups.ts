import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** One group (or a section's students in no group) an activity is assigned to. */
export interface AssignedGroup {
  /** "team:<id>", or "section:<id>" for students in no group there. */
  key: string;
  /** "BSN 1101 · Group A", or "BSN 1101" for students in no group. */
  label: string;
  count: number;
  student_ids: string[];
  /** Their deadline; "mixed" when they don't share one. */
  deadline: string | null | 'mixed';
  /** How many of them are done (graded), for rows that say so. */
  done: number;
}

/**
 * Who has each activity, by group: the quiz cards' "Assigned to BSN 1101 ·
 * Group A" and the list behind "Who has it". Students are placed in their
 * current group, or under their section when they're in none.
 */
export async function assignedGroups(
  supabase: Supabase,
  rows: { activity_id: string; student_id: string; deadline: string | null; done?: boolean }[],
): Promise<Map<string, AssignedGroup[]>> {
  const out = new Map<string, AssignedGroup[]>();
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  if (studentIds.length === 0) return out;

  const [{ data: users }, { data: memberships }] = await Promise.all([
    supabase.from('users').select('id, section_id').in('id', studentIds),
    supabase.from('team_members').select('student_id, team_id').in('student_id', studentIds),
  ]);
  const sectionOf = new Map(((users ?? []) as { id: string; section_id: string | null }[]).map((u) => [u.id, u.section_id]));
  const teamOf = new Map(((memberships ?? []) as { student_id: string; team_id: string }[]).map((m) => [m.student_id, m.team_id]));
  const teamIds = [...new Set(teamOf.values())];
  const { data: teams } = teamIds.length
    ? await supabase.from('teams').select('id, name, section_id').in('id', teamIds)
    : { data: [] as { id: string; name: string; section_id: string }[] };
  const teamById = new Map(((teams ?? []) as { id: string; name: string; section_id: string }[]).map((t) => [t.id, t]));
  const sectionIds = [
    ...new Set([...sectionOf.values(), ...[...teamById.values()].map((t) => t.section_id)].filter((x): x is string => !!x)),
  ];
  const { data: sections } = sectionIds.length
    ? await supabase.from('sections').select('id, name').in('id', sectionIds)
    : { data: [] as { id: string; name: string }[] };
  const sectionName = new Map(((sections ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const groups = new Map<string, Map<string, AssignedGroup>>();
  for (const r of rows) {
    const team = teamById.get(teamOf.get(r.student_id) ?? '');
    const sectionId = team?.section_id ?? sectionOf.get(r.student_id) ?? null;
    const key = team ? `team:${team.id}` : `section:${sectionId ?? 'none'}`;
    const section = sectionId ? (sectionName.get(sectionId) ?? 'Section') : 'No section';
    const label = team ? `${section} · ${team.name}` : section;
    const byKey = groups.get(r.activity_id) ?? new Map<string, AssignedGroup>();
    const g = byKey.get(key);
    if (g) {
      g.count += 1;
      g.student_ids.push(r.student_id);
      if (r.done) g.done += 1;
      if (g.deadline !== r.deadline) g.deadline = 'mixed';
    } else {
      byKey.set(key, { key, label, count: 1, student_ids: [r.student_id], deadline: r.deadline, done: r.done ? 1 : 0 });
    }
    groups.set(r.activity_id, byKey);
  }
  for (const [id, byKey] of groups) {
    out.set(id, [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
  }
  return out;
}
