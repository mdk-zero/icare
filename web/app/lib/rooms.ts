/**
 * Shared room-capacity helpers. A room's occupancy is the number of patients
 * linked to it; capacity is the hard ceiling. Used by the faculty patients page
 * (cards + room picker) and reusable by admin Rooms.
 */

export type RoomStatus = "available" | "crowded" | "full";

/** full at/over capacity, crowded from 80%, else available. capacity 0 → full. */
export function roomStatus(occupied: number, capacity: number): RoomStatus {
  if (capacity <= 0 || occupied >= capacity) return "full";
  if (occupied >= Math.ceil(capacity * 0.8)) return "crowded";
  return "available";
}

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Available",
  crowded: "Crowded",
  full: "Full",
};

export const ROOM_STATUS_TONE: Record<RoomStatus, string> = {
  available: "bg-emerald-100 text-emerald-700 border-emerald-200",
  crowded: "bg-amber-100 text-amber-700 border-amber-200",
  full: "bg-rose-100 text-rose-700 border-rose-200",
};
