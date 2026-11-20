import { viewerDeanId } from './dean-scope';
import type { getSupabaseAdmin } from './supabase/server';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/**
 * The room a patient case or Return Demonstration is performed in (098). A
 * room is only where the activity happens: it is set on each student's
 * assignment. The activity's time limit is in activity-time.ts.
 */

/** What the server says when 098 is not on the database yet. */
export const ROOMS_NEED_MIGRATION = 'Rooms and time limits need database migration 098 applied first.';

/**
 * The room from a request body, checked to be one of the viewer's Dean's
 * rooms (077). null (or "") clears it; `undefined` when it was left out.
 */
export async function resolveRoom(
  supabase: SupabaseAdmin,
  session: { uid: string; role: string },
  value: unknown,
): Promise<{ value: string | null | undefined; name?: string } | { error: string }> {
  if (value === undefined) return { value: undefined };
  if (value === null || value === '') return { value: null };
  if (typeof value !== 'string') return { error: 'Pick a room from the list' };
  const deanId = await viewerDeanId(supabase, session);
  let query = supabase.from('rooms').select('id, name').eq('id', value);
  if (deanId) query = query.eq('admin_id', deanId);
  const { data } = await query.maybeSingle();
  return data ? { value: data.id as string, name: data.name as string } : { error: 'Room not found' };
}

/** True when a read or write failed because a 098 column is not on the database yet. */
export function isMissingRoomColumns(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    (error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST200') &&
    /time_limit_minutes|room_id|rooms/.test(error.message ?? '')
  );
}

/** Each activity's time limit, by id; empty before 098. */
export async function loadTimeLimits(supabase: SupabaseAdmin, scenarioIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (scenarioIds.length === 0) return out;
  const { data, error } = await supabase.from('scenarios').select('id, time_limit_minutes').in('id', scenarioIds);
  if (error) {
    if (isMissingRoomColumns(error)) return out;
    throw new Error(`Unable to read the time limits: ${error.message}`);
  }
  for (const r of (data ?? []) as { id: string; time_limit_minutes: number | null }[]) {
    if (r.time_limit_minutes) out.set(r.id, r.time_limit_minutes);
  }
  return out;
}

/** Each assignment's room (id and name), by assignment id; empty before 098. */
export async function loadAssignmentRooms(
  supabase: SupabaseAdmin,
  assignmentIds: string[],
): Promise<Map<string, { id: string; name: string; room_number: string | null }>> {
  const out = new Map<string, { id: string; name: string; room_number: string | null }>();
  if (assignmentIds.length === 0) return out;
  const { data, error } = await supabase
    .from('scenario_assignments')
    .select('id, room_id, rooms(id, name, room_number)')
    .in('id', assignmentIds)
    .not('room_id', 'is', null);
  if (error) {
    if (isMissingRoomColumns(error)) return out;
    throw new Error(`Unable to read the rooms: ${error.message}`);
  }
  for (const r of (data ?? []) as unknown as { id: string; rooms: { id: string; name: string; room_number: string | null } | null }[]) {
    if (r.rooms) out.set(r.id, r.rooms);
  }
  return out;
}
