import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Every Dean works in their own space (migration 077). Sections, rooms,
 * patients, patient cases, quizzes, case presentations, library materials and
 * scenario categories carry the id of the Dean who owns them in `admin_id`,
 * and so do instructors and students. Nobody sees another Dean's rows, even a
 * Dean at the same institution: a Dean sees their own, an instructor or a
 * student sees their Dean's. Super admins see everything.
 *
 * Before 077 there are no owner columns, and every helper here reads as "no
 * limit", so the app behaves as it did.
 */

/** Matches no row: the owner of nothing, for someone who belongs to no Dean. */
export const NO_DEAN = '00000000-0000-0000-0000-000000000000';

const RECHECK_MS = 60_000;
let ownershipLive = false;
let checkedAt = 0;

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Whether 077's owner columns exist. Once seen they are remembered; a miss
 * is checked again after a minute, so applying the migration takes effect
 * without a redeploy.
 */
export async function deanOwnershipLive(supabase: Supabase): Promise<boolean> {
  if (ownershipLive) return true;
  if (Date.now() - checkedAt < RECHECK_MS) return false;
  const { error } = await supabase.from('sections').select('admin_id').limit(1);
  if (error && !isMissingColumn(error)) {
    // Not knowing must not read as "no limit".
    console.error('Failed to check for Dean ownership', error);
    throw new Error('Unable to check data ownership');
  }
  checkedAt = Date.now();
  ownershipLive = !error;
  return ownershipLive;
}

/**
 * The Dean whose data this session works in: a Dean's own id, or the Dean an
 * instructor or student belongs to (users.admin_id). NO_DEAN for someone who
 * belongs to no Dean, so they see nobody's rows. null means no limit: a
 * super admin, or a database without 077.
 */
export async function viewerDeanId(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<string | null> {
  if (session.role === 'super_admin') return null;
  if (!(await deanOwnershipLive(supabase))) return null;
  if (session.role === 'admin') return session.uid;
  const { data, error } = await supabase.from('users').select('admin_id').eq('id', session.uid).maybeSingle();
  if (error) {
    console.error('Failed to read the Dean of an account', error);
    throw new Error('Unable to read your Dean');
  }
  return (data?.admin_id as string | null) ?? NO_DEAN;
}

/** The PostgREST filter for "owned by this Dean, or a preset nobody owns". */
export function ownedOrSharedFilter(deanId: string): string {
  return `admin_id.eq.${deanId},admin_id.is.null`;
}

/** Whether one row of an owned table belongs to the viewer's Dean (always, with no limit). */
export async function ownsRow(
  supabase: Supabase,
  table: string,
  id: string,
  deanId: string | null,
): Promise<boolean> {
  if (deanId === null) return true;
  const { data, error } = await supabase.from(table).select('admin_id').eq('id', id).maybeSingle();
  if (error) {
    console.error(`Failed to read the owner of ${table} ${id}`, error);
    throw new Error('Unable to check who this belongs to');
  }
  return data?.admin_id === deanId;
}

/** The ids among `ids` that belong to the viewer's Dean (all of them, with no limit). */
export async function ownedIds(
  supabase: Supabase,
  table: string,
  ids: string[],
  deanId: string | null,
): Promise<string[]> {
  if (deanId === null || ids.length === 0) return ids;
  const { data, error } = await supabase.from(table).select('id').in('id', ids).eq('admin_id', deanId);
  if (error) {
    console.error(`Failed to read the owners of ${table}`, error);
    throw new Error('Unable to check who these belong to');
  }
  return (data ?? []).map((r) => r.id as string);
}

/** The institution (campuses row, 007) a Dean belongs to; null when none is set. */
export async function deanInstitution(
  supabase: Supabase,
  deanId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('campus_id, campuses(id, name)')
    .eq('id', deanId)
    .maybeSingle();
  if (error) {
    console.error('Failed to read the institution of a Dean', error);
    return null;
  }
  const campus = (data as unknown as { campuses: { id: string; name: string } | null } | null)?.campuses ?? null;
  return campus ? { id: campus.id, name: campus.name } : null;
}
