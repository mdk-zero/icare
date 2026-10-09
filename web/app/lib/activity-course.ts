import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * The course an activity is made for (migration 070). Every Patient Case,
 * Quiz and Case Presentation an instructor makes belongs to one of their
 * course offerings, which is what files it under that course's grading.
 * A Dean makes activities for no course.
 *
 * Before 070 there is no offering_id column: nothing is checked or stored.
 */

export type ActivityTable = 'scenarios' | 'assessments' | 'case_presentations';

/** Whether 070 is applied, so offering_id can be written. */
export async function activityCoursesReady(supabase: Supabase, table: ActivityTable): Promise<boolean> {
  const { error } = await supabase.from(table).select('offering_id').limit(1);
  if (!error) return true;
  if (error.code === '42703' || error.code === 'PGRST204') return false;
  throw new Error(`Unable to read ${table}: ${error.message}`);
}

/** The offering a request names, or null when it names none. */
export function parseOfferingId(body: Record<string, unknown>): string | null {
  const value = body.offering_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Checks the course an activity is made for. Returns the column to store
 * (empty before 070, or for a Dean), or an error for the caller to send.
 */
export async function activityCourse(
  supabase: Supabase,
  table: ActivityTable,
  session: { uid: string; role: string },
  offeringId: string | null,
): Promise<{ value: { offering_id?: string | null } } | { error: string }> {
  if (!(await activityCoursesReady(supabase, table))) return { value: {} };
  if (session.role !== 'faculty') return { value: offeringId ? { offering_id: offeringId } : {} };
  if (!offeringId) return { error: 'Choose the course this is for.' };
  const { data, error } = await supabase
    .from('course_offerings')
    .select('id')
    .eq('id', offeringId)
    .eq('faculty_id', session.uid)
    .maybeSingle();
  if (error) throw new Error(`Unable to read the course: ${error.message}`);
  if (!data) return { error: 'You can only make this for a course you teach.' };
  return { value: { offering_id: offeringId } };
}

/** Activity id -> the offering it was made for (null: none). Empty before 070. */
export async function activityOfferings(
  supabase: Supabase,
  table: ActivityTable,
  ids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from(table).select('id, offering_id').in('id', ids);
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return map;
    throw new Error(`Unable to read ${table}: ${error.message}`);
  }
  for (const row of data ?? []) map.set(row.id as string, (row.offering_id as string | null) ?? null);
  return map;
}
