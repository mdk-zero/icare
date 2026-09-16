"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faWrench, faBan, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Room } from "../lib/api";
import { roomStatus } from "../lib/rooms";

/**
 * Ward floor plan. Rooms are rectangles on a fixed grid; placement lives on
 * the rooms table (migration 035). FloorPlanCanvas renders it read-only with
 * live occupancy colors; FloorPlanEditor adds drag-to-move, resize, and an
 * unplaced-rooms tray. The editor is controlled: the page owns the working
 * layout and receives every committed change through onChange.
 */

export const GRID_COLS = 24;
export const GRID_ROWS = 16;

/** Default footprint for a newly placed room. */
const NEW_W = 4;
const NEW_H = 3;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Working layout: room id → rectangle, or null for "not on the plan". */
export type Layout = Record<string, Rect | null>;

/** The stored placement of a room, or null when any field is missing. */
export function roomRect(room: Room): Rect | null {
  if (room.plan_x == null || room.plan_y == null || room.plan_w == null || room.plan_h == null) {
    return null;
  }
  return { x: room.plan_x, y: room.plan_y, w: room.plan_w, h: room.plan_h };
}

export function layoutFromRooms(rooms: Room[]): Layout {
  const layout: Layout = {};
  for (const room of rooms) layout[room.id] = roomRect(room);
  return layout;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collides(rect: Rect, layout: Layout, ignoreId: string): boolean {
  return Object.entries(layout).some(
    ([id, other]) => id !== ignoreId && other !== null && rectsOverlap(rect, other),
  );
}

/** First free spot for a default-sized block, scanning left-to-right, top-down. */
export function findFreeSpot(layout: Layout): Rect | null {
  for (const [w, h] of [
    [NEW_W, NEW_H],
    [3, 2],
    [2, 2],
  ]) {
    for (let y = 0; y + h <= GRID_ROWS; y++) {
      for (let x = 0; x + w <= GRID_COLS; x++) {
        const rect = { x, y, w, h };
        if (!collides(rect, layout, "")) return rect;
      }
    }
  }
  return null;
}

/** Occupancy tone classes, aligned with lib/rooms tones but block-sized. */
const OCCUPANCY_TONE: Record<ReturnType<typeof roomStatus>, string> = {
  available: "bg-emerald-50 border-emerald-300 text-emerald-900",
  crowded: "bg-amber-50 border-amber-300 text-amber-900",
  full: "bg-rose-50 border-rose-300 text-rose-900",
};

const OCCUPANCY_BADGE: Record<ReturnType<typeof roomStatus>, string> = {
  available: "bg-emerald-600",
  crowded: "bg-amber-500",
  full: "bg-rose-600",
};

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

interface BlockVisual {
  room: Room;
  rect: Rect;
  occupied: number;
}

/** Shared block face, so the editor and the read-only canvas cannot drift. */
function BlockFace({ room, occupied }: { room: Room; occupied: number }) {
  const offline = room.status !== "active";
  const tone = roomStatus(occupied, room.capacity);
  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden p-1.5 text-left">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold leading-tight">{room.name}</p>
        <p className="truncate text-[10px] opacity-70">Room {room.room_number}</p>
      </div>
      <div className="flex items-center gap-1">
        {offline ? (
          <span className="inline-flex items-center gap-1 rounded bg-gray-500 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            <FontAwesomeIcon icon={room.status === "maintenance" ? faWrench : faBan} className="h-2 w-2" />
            {room.status}
          </span>
        ) : (
          <span
            className={`rounded px-1 py-0.5 font-mono text-[9px] font-semibold leading-none text-white ${OCCUPANCY_BADGE[tone]}`}
          >
            {occupied}/{room.capacity}
          </span>
        )}
      </div>
    </div>
  );
}

function blockClasses(room: Room, occupied: number): string {
  if (room.status !== "active") {
    return "bg-gray-100 border-gray-300 text-gray-500 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]";
  }
  return OCCUPANCY_TONE[roomStatus(occupied, room.capacity)];
}

/** The grid surface both variants draw on. */
function Surface({
  children,
  onBackgroundPointerDown,
}: {
  children: React.ReactNode;
  /** Fires only for the empty grid, never for a room block. */
  onBackgroundPointerDown?: () => void;
}) {
  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onBackgroundPointerDown?.();
      }}
      className="relative w-full rounded-xl border border-hairline bg-subtle"
      style={{
        aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
        backgroundImage:
          "linear-gradient(to right, rgba(120,120,120,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,120,0.08) 1px, transparent 1px)",
        backgroundSize: `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only canvas (faculty Monitoring)
// ---------------------------------------------------------------------------

export function FloorPlanCanvas({
  rooms,
  occupancy,
  onRoomClick,
  dimmedUnless,
}: {
  rooms: Room[];
  /** Admitted patients per room id; rooms absent from the map read as 0. */
  occupancy: Map<string, number>;
  onRoomClick?: (room: Room) => void;
  /**
   * When set, rooms outside this set are dimmed — the map's way of answering a
   * filter applied above it. Omit it entirely to leave every room at full
   * strength; an empty set legitimately means "nothing matched".
   */
  dimmedUnless?: Set<string>;
}) {
  const blocks: BlockVisual[] = [];
  for (const room of rooms) {
    const rect = roomRect(room);
    if (rect) blocks.push({ room, rect, occupied: occupancy.get(room.id) ?? 0 });
  }
  if (blocks.length === 0) return null;

  return (
    <Surface>
      {blocks.map(({ room, rect, occupied }) => (
        <button
          key={room.id}
          onClick={() => onRoomClick?.(room)}
          title={`${room.name} · Room ${room.room_number}`}
          className={`absolute rounded-lg border shadow-sm transition-all hover:z-10 hover:shadow-md hover:brightness-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-600/50 ${
            dimmedUnless && !dimmedUnless.has(room.id) ? "opacity-35" : ""
          } ${blockClasses(room, occupied)}`}
          style={{
            left: pct(rect.x, GRID_COLS),
            top: pct(rect.y, GRID_ROWS),
            width: pct(rect.w, GRID_COLS),
            height: pct(rect.h, GRID_ROWS),
          }}
        >
          <BlockFace room={room} occupied={occupied} />
        </button>
      ))}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Editor (admin Rooms)
// ---------------------------------------------------------------------------

interface DragState {
  roomId: string;
  mode: "move" | "resize";
  /** Pointer position at drag start, in px. */
  startX: number;
  startY: number;
  /** The rect when the drag started. */
  origin: Rect;
  /** Live preview; null until the pointer has actually moved a cell. */
  preview: Rect | null;
  valid: boolean;
}

export function FloorPlanEditor({
  rooms,
  layout,
  occupancy,
  onChange,
  onEditRoom,
  onDeleteRoom,
}: {
  rooms: Room[];
  layout: Layout;
  occupancy: Map<string, number>;
  /** null rect = remove the room from the plan. */
  onChange: (roomId: string, rect: Rect | null) => void;
  /** Open the room's edit form; a click (no drag) selects and the bar offers it. */
  onEditRoom?: (room: Room) => void;
  /** Delete the room record itself — the caller owns the confirm. */
  onDeleteRoom?: (room: Room) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const placed = rooms.filter((r) => layout[r.id]);
  const unplaced = rooms.filter((r) => !layout[r.id]);
  // Derived from rooms, so a deletion elsewhere clears the bar by itself.
  const selectedRoom = rooms.find((r) => r.id === selectedId) ?? null;

  /** Grid cell size in px, from the live surface — resizes with the page. */
  const cellSize = (): { w: number; h: number } => {
    const el = surfaceRef.current;
    if (!el) return { w: 1, h: 1 };
    const rect = el.getBoundingClientRect();
    return { w: rect.width / GRID_COLS, h: rect.height / GRID_ROWS };
  };

  const startDrag = (e: React.PointerEvent, roomId: string, mode: DragState["mode"]) => {
    const origin = layout[roomId];
    if (!origin) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ roomId, mode, startX: e.clientX, startY: e.clientY, origin, preview: null, valid: true });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const { w: cw, h: ch } = cellSize();
    const dx = Math.round((e.clientX - drag.startX) / cw);
    const dy = Math.round((e.clientY - drag.startY) / ch);
    let next: Rect;
    if (drag.mode === "move") {
      next = {
        ...drag.origin,
        x: Math.min(Math.max(drag.origin.x + dx, 0), GRID_COLS - drag.origin.w),
        y: Math.min(Math.max(drag.origin.y + dy, 0), GRID_ROWS - drag.origin.h),
      };
    } else {
      next = {
        ...drag.origin,
        w: Math.min(Math.max(drag.origin.w + dx, 1), GRID_COLS - drag.origin.x),
        h: Math.min(Math.max(drag.origin.h + dy, 1), GRID_ROWS - drag.origin.y),
      };
    }
    setDrag({ ...drag, preview: next, valid: !collides(next, layout, drag.roomId) });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.preview && drag.valid) {
      onChange(drag.roomId, drag.preview);
      setSelectedId(drag.roomId);
    } else if (!drag.preview) {
      // The pointer never left its cell: that is a click, and clicks select.
      setSelectedId((prev) => (prev === drag.roomId ? null : drag.roomId));
    }
    setDrag(null);
  };

  const placeRoom = (roomId: string) => {
    const spot = findFreeSpot(layout);
    if (spot) onChange(roomId, spot);
  };

  const trayFull = findFreeSpot(layout) === null;

  return (
    <div className="space-y-3">
      {selectedRoom && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-600/30 bg-brand-600/5 px-3 py-2">
          <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
            {selectedRoom.name}
            <span className="ml-1.5 font-normal text-gray-500">
              Room {selectedRoom.room_number} · {occupancy.get(selectedRoom.id) ?? 0}/
              {selectedRoom.capacity} beds
            </span>
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            {onEditRoom && (
              <button
                onClick={() => onEditRoom(selectedRoom)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-600/10 transition-colors"
              >
                <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                Edit
              </button>
            )}
            {layout[selectedRoom.id] && (
              <button
                onClick={() => onChange(selectedRoom.id, null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                Remove from plan
              </button>
            )}
            {onDeleteRoom && (
              <button
                onClick={() => onDeleteRoom(selectedRoom)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                Delete
              </button>
            )}
            <button
              onClick={() => setSelectedId(null)}
              title="Deselect"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div ref={surfaceRef}>
        <Surface onBackgroundPointerDown={() => setSelectedId(null)}>
          {placed.map((room) => {
            const isDragging = drag?.roomId === room.id;
            const rect = (isDragging && drag.preview) || layout[room.id]!;
            const occupied = occupancy.get(room.id) ?? 0;
            return (
              <div
                key={room.id}
                onPointerDown={(e) => startDrag(e, room.id, "move")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                className={`group absolute cursor-move touch-none select-none rounded-lg border shadow-sm ${
                  isDragging
                    ? drag.valid
                      ? "z-20 ring-2 ring-brand-600/60"
                      : "z-20 ring-2 ring-rose-500 opacity-70"
                    : selectedId === room.id
                      ? "z-10 ring-2 ring-brand-600"
                      : "hover:z-10 hover:shadow-md"
                } ${blockClasses(room, occupied)}`}
                style={{
                  left: pct(rect.x, GRID_COLS),
                  top: pct(rect.y, GRID_ROWS),
                  width: pct(rect.w, GRID_COLS),
                  height: pct(rect.h, GRID_ROWS),
                  transition: isDragging ? "none" : "left 80ms, top 80ms, width 80ms, height 80ms",
                }}
              >
                <BlockFace room={room} occupied={occupied} />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onChange(room.id, null)}
                  title="Remove from plan"
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-surface text-gray-500 shadow-sm hover:text-rose-600 group-hover:flex"
                >
                  <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                </button>
                {/* Resize grip: its own drag mode, so it never moves the block. */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(e, room.id, "resize");
                  }}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  title="Drag to resize"
                  className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-tl border-l border-t border-current opacity-30 hover:opacity-70"
                />
              </div>
            );
          })}
          {placed.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="max-w-xs text-center text-sm text-gray-400">
                No rooms on the plan yet — place one from the tray below, then drag it into
                position.
              </p>
            </div>
          )}
        </Surface>
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Not on the plan ({unplaced.length})
        </p>
        {unplaced.length === 0 ? (
          <p className="text-sm text-gray-400">Every room is placed.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unplaced.map((room) => (
              <span
                key={room.id}
                className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 bg-surface text-xs font-medium text-gray-700"
              >
                <button
                  onClick={() => placeRoom(room.id)}
                  disabled={trayFull}
                  title={trayFull ? "No free space left on the plan" : "Place on the plan"}
                  className="px-2.5 py-1.5 transition-colors hover:bg-brand-600/5 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {room.name} · {room.room_number}
                </button>
                {onEditRoom && (
                  <button
                    onClick={() => onEditRoom(room)}
                    title="Edit room"
                    className="border-l border-gray-200 px-2 py-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-brand-700"
                  >
                    <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                  </button>
                )}
                {onDeleteRoom && (
                  <button
                    onClick={() => onDeleteRoom(room)}
                    title="Delete room"
                    className="border-l border-gray-200 px-2 py-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
