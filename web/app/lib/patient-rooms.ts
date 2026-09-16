import type { getSupabaseAdmin } from './supabase/server';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/**
 * Shared by the patients CRUD route and the check-in/check-out route so the
 * two cannot disagree on what a room label looks like or when a room is full.
 */

/**
 * Resolves a room_id to the stored FK plus a denormalized room_number label
 * ("<name> · Room <number>") that EHR/Vitals/AI read. An unknown or empty id
 * clears both. Returns { room_id: null } if the id doesn't match a room.
 */
export async function resolveRoom(
  supabase: SupabaseAdmin,
  roomId: string | null,
): Promise<{ room_id: string | null; room_number: string }> {
  if (!roomId) return { room_id: null, room_number: '' };
  const { data: room } = await supabase
    .from('rooms')
    .select('name, room_number')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return { room_id: null, room_number: '' };
  return { room_id: roomId, room_number: `${room.name} · Room ${room.room_number}` };
}

/**
 * Rooms are hard-capped: refuses a room already at capacity. Only admitted
 * patients occupy a bed — check-out clears room_id, and this filter keeps a
 * stray discharged row (hand-edited data) from blocking a bed forever.
 * excludePatientId skips the row being edited so re-saving a patient in its
 * own full room is fine. Returns an error message when full, or null when
 * there is space / no such room.
 */
export async function roomCapacityError(
  supabase: SupabaseAdmin,
  roomId: string,
  excludePatientId: string | null,
): Promise<string | null> {
  const { data: room } = await supabase
    .from('rooms')
    .select('name, capacity')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return null; // unknown room — resolveRoom clears it, no capacity concern
  let query = supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('status', 'admitted');
  if (excludePatientId) query = query.neq('id', excludePatientId);
  const { count } = await query;
  if ((count ?? 0) >= room.capacity) {
    return `${room.name} is full (${room.capacity}/${room.capacity}). Free a bed or pick another room.`;
  }
  return null;
}
