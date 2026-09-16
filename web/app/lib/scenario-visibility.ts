import type { getSupabaseAdmin } from './supabase/server';
import { getFacultyStudentIds } from './roster';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Which scenarios a faculty member may see.
 *
 * An unassigned scenario is shared material: every faculty member sees it, so
 * a bank of cases can be authored once and drawn from by anyone. The moment a
 * scenario is assigned to a student it stops being shared and becomes that
 * student's work — visible only to the faculty who teach them, because a
 * scenario in flight carries a roster and a set of submissions with it.
 *
 * Connection is section-based, the same rule as the rest of the app: a
 * faculty member's students are those in the sections listed against them in
 * faculty_sections (see ./roster). Admins are not filtered.
 *
 * The rule lives here rather than in either route because both the list
 * (/api/faculty/scenarios) and the single fetch (/api/scenarios/[id]) have to
 * apply it. Filtering only the list would hide a scenario from the page while
 * still serving it to anyone who knows the id.
 */

/**
 * The rule itself, kept pure so the list can apply it to many scenarios with
 * one roster lookup and the detail route can apply it to one.
 */
export function scenarioVisibleToFaculty(
  assignedStudentIds: readonly string[],
  facultyStudentIds: ReadonlySet<string>,
): boolean {
  if (assignedStudentIds.length === 0) return true;
  return assignedStudentIds.some((id) => facultyStudentIds.has(id));
}

/** The faculty member's own students, as a set for repeated membership tests. */
export async function getFacultyStudentIdSet(
  supabase: Supabase,
  facultyId: string,
): Promise<Set<string>> {
  return new Set(await getFacultyStudentIds(supabase, facultyId));
}

/**
 * Whether one scenario is visible to one faculty member.
 *
 * Checks the assignments first: an unassigned scenario is visible to everyone,
 * and answering that needs no roster lookup at all.
 */
export async function canFacultySeeScenario(
  supabase: Supabase,
  facultyId: string,
  scenarioId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('scenario_assignments')
    .select('student_id')
    .eq('scenario_id', scenarioId);

  if (error) {
    console.error('Failed to fetch scenario assignments', error);
    throw new Error('Unable to check scenario visibility');
  }

  const assigned = (data ?? []).map((row) => row.student_id as string);
  if (assigned.length === 0) return true;

  return scenarioVisibleToFaculty(assigned, await getFacultyStudentIdSet(supabase, facultyId));
}
