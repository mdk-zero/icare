/**
 * Room occupancy tones, mirrored from the web app's app/lib/rooms.ts so the
 * Clinic tab colours a room exactly the way admin Rooms and faculty Monitoring
 * do. Same arrangement as lib/vitals-rules.ts, which mirrors the server's
 * vitals thresholds: one small copy, kept deliberately in step.
 */

export type RoomTone = 'available' | 'crowded' | 'full';

/** full at/over capacity, crowded from 80%, else available. capacity 0 → full. */
export function roomStatus(occupied: number, capacity: number): RoomTone {
  if (capacity <= 0 || occupied >= capacity) return 'full';
  if (occupied >= Math.ceil(capacity * 0.8)) return 'crowded';
  return 'available';
}

export const ROOM_TONE_LABEL: Record<RoomTone, string> = {
  available: 'Available',
  crowded: 'Crowded',
  full: 'Full',
};
