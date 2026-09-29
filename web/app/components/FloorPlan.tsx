"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faPen,
  faTrash,
  faUserPlus,
  faRotateRight,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import { WARD_FIXTURE_KINDS } from "../lib/api";
import type { DoorSide, Room, WardFixture, WardFixtureKind } from "../lib/api";
import {
  FIXTURE_LABEL,
  FIXTURE_SIZE,
  FixtureDrawing,
  planWalls,
  RoomDrawing,
  wallBlockForFixture,
  type WallBlock,
} from "./FloorPlanDrawing";

/**
 * Ward floor plan. Rooms are rectangles on a fixed grid; placement lives on
 * the rooms table (migration 035), with each room's door wall and the plan's
 * corridors and fixtures from migration 062. FloorPlanDrawing draws them as an
 * architect's plan. FloorPlanCanvas renders it read-only with live occupancy;
 * FloorPlanEditor adds drag-to-move, resize, and a palette of unplaced rooms
 * and fixtures that drag onto the sheet. The editor is controlled: the page
 * owns the working plan and receives every committed change through
 * onPlanChange.
 */

export const GRID_COLS = 24;
export const GRID_ROWS = 16;

/** Default footprint for a newly placed room. */
const NEW_W = 4;
const NEW_H = 3;

/** Pointer travel, in px, before a press on a palette chip becomes a drag. */
const DRAG_SLOP = 4;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Working layout: room id → rectangle, or null for "not on the plan". */
export type Layout = Record<string, Rect | null>;

/** Everything the editor changes, held by the page until Save. */
export interface PlanDraft {
  rooms: Layout;
  doors: Record<string, DoorSide>;
  fixtures: WardFixture[];
}

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

/** A room's door wall; rooms saved before migration 062 open to the south. */
export function doorOf(room: Room): DoorSide {
  return room.plan_door ?? "s";
}

export function planFromServer(rooms: Room[], fixtures: WardFixture[]): PlanDraft {
  const doors: Record<string, DoorSide> = {};
  for (const room of rooms) doors[room.id] = doorOf(room);
  return { rooms: layoutFromRooms(rooms), doors, fixtures };
}

function sameRect(a: Rect | null | undefined, b: Rect | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function fixtureKey(f: WardFixture): string {
  return `${f.id}|${f.kind}|${f.label}|${f.plan_x},${f.plan_y},${f.plan_w},${f.plan_h}`;
}

/**
 * What Save has to send: the rooms whose rectangle or door changed (a door is
 * only sent with it changed, so a plan saved before migration 062 never asks
 * for the column), and whether the fixture set differs at all.
 */
export function planChanges(draft: PlanDraft, server: PlanDraft, rooms: Room[]) {
  const positions = rooms
    .filter(
      (r) =>
        !sameRect(draft.rooms[r.id], server.rooms[r.id]) ||
        (draft.rooms[r.id] && draft.doors[r.id] !== server.doors[r.id]),
    )
    .map((r) => {
      const rect = draft.rooms[r.id] ?? null;
      const doorMoved = rect && draft.doors[r.id] !== server.doors[r.id];
      return {
        id: r.id,
        x: rect?.x ?? null,
        y: rect?.y ?? null,
        w: rect?.w ?? null,
        h: rect?.h ?? null,
        ...(doorMoved ? { door: draft.doors[r.id] } : {}),
      };
    });
  const a = draft.fixtures.map(fixtureKey).sort().join("\n");
  const b = server.fixtures.map(fixtureKey).sort().join("\n");
  return { positions, fixturesChanged: a !== b };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function fixtureRect(f: WardFixture): Rect {
  return { x: f.plan_x, y: f.plan_y, w: f.plan_w, h: f.plan_h };
}

/**
 * Everything on the plan that blocks a drop, keyed "r:<room id>" or
 * "f:<fixture id>". Free-text labels float over anything, so they neither
 * block nor are blocked.
 */
function solidRects(plan: PlanDraft): [string, Rect][] {
  const out: [string, Rect][] = [];
  for (const [id, rect] of Object.entries(plan.rooms)) if (rect) out.push([`r:${id}`, rect]);
  for (const f of plan.fixtures) if (f.kind !== "label") out.push([`f:${f.id}`, fixtureRect(f)]);
  return out;
}

function collides(rect: Rect, plan: PlanDraft, ignoreKey: string, kind?: WardFixtureKind): boolean {
  if (kind === "label") return false;
  return solidRects(plan).some(([key, other]) => key !== ignoreKey && rectsOverlap(rect, other));
}

/** First free spot, trying each size in turn, scanning left-to-right, top-down. */
function findFreeSpot(plan: PlanDraft, sizes: [number, number][]): Rect | null {
  for (const [w, h] of sizes) {
    for (let y = 0; y + h <= GRID_ROWS; y++) {
      for (let x = 0; x + w <= GRID_COLS; x++) {
        const rect = { x, y, w, h };
        if (!collides(rect, plan, "")) return rect;
      }
    }
  }
  return null;
}

const ROOM_SIZES: [number, number][] = [
  [NEW_W, NEW_H],
  [3, 2],
  [2, 2],
];

function fixtureSizes(kind: WardFixtureKind): [number, number][] {
  const { w, h } = FIXTURE_SIZE[kind];
  return [
    [w, h],
    [Math.max(1, w - 1), h],
    [1, 1],
  ];
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function rectStyle(rect: Rect, index = 0): React.CSSProperties {
  return {
    left: pct(rect.x, GRID_COLS),
    top: pct(rect.y, GRID_ROWS),
    width: pct(rect.w, GRID_COLS),
    height: pct(rect.h, GRID_ROWS),
    animationDelay: `${Math.min(index, 24) * 28}ms`,
  };
}

/** Rooms and walled fixtures, keyed like solidRects, for shared walls. */
function wallsFor(
  rooms: { id: string; rect: Rect; door: DoorSide }[],
  fixtures: { id: string; kind: WardFixtureKind; rect: Rect }[],
) {
  const blocks: WallBlock[] = rooms.map(({ id, rect, door }) => ({ key: `r:${id}`, ...rect, door }));
  for (const f of fixtures) {
    const block = wallBlockForFixture(`f:${f.id}`, f.kind, f.rect);
    if (block) blocks.push(block);
  }
  return planWalls(blocks);
}

interface BlockVisual {
  room: Room;
  rect: Rect;
  occupied: number;
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
      className="relative w-full rounded-xl border border-hairline shadow-[inset_0_0_0_6px_var(--plan-paper),inset_0_0_0_7px_var(--plan-grid-major)]"
      style={{
        aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
        backgroundColor: "var(--plan-paper)",
        // A fine grid every cell and a stronger one every four, like a sheet
        // of drafting paper.
        backgroundImage: [
          "linear-gradient(to right, var(--plan-grid-major) 1px, transparent 1px)",
          "linear-gradient(to bottom, var(--plan-grid-major) 1px, transparent 1px)",
          "linear-gradient(to right, var(--plan-grid) 1px, transparent 1px)",
          "linear-gradient(to bottom, var(--plan-grid) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: [
          `${400 / GRID_COLS}% ${400 / GRID_ROWS}%`,
          `${400 / GRID_COLS}% ${400 / GRID_ROWS}%`,
          `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
          `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
        ].join(", "),
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
  fixtures = [],
  occupancy,
  onRoomClick,
  dimmedUnless,
}: {
  rooms: Room[];
  /** Corridors, stations and labels, drawn beneath the rooms. */
  fixtures?: WardFixture[];
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
  const walls = wallsFor(
    blocks.map(({ room, rect }) => ({ id: room.id, rect, door: doorOf(room) })),
    fixtures.map((f) => ({ id: f.id, kind: f.kind, rect: fixtureRect(f) })),
  );

  return (
    <Surface>
      {fixtures.map((f, i) => (
        <div
          key={f.id}
          className={`plan-block-in pointer-events-none absolute ${f.kind === "label" ? "z-[5]" : ""}`}
          style={rectStyle(fixtureRect(f), i)}
        >
          <FixtureDrawing
            kind={f.kind}
            label={f.label}
            w={f.plan_w}
            h={f.plan_h}
            walls={walls.get(`f:${f.id}`)}
          />
        </div>
      ))}
      {blocks.map(({ room, rect, occupied }, i) => (
        <button
          key={room.id}
          onClick={() => onRoomClick?.(room)}
          title={`${room.name} · Room ${room.room_number}`}
          className={`plan-block-in absolute rounded-sm transition-[opacity,filter] hover:z-10 hover:drop-shadow-[0_4px_10px_rgba(0,0,0,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 ${
            dimmedUnless && !dimmedUnless.has(room.id) ? "opacity-35" : ""
          }`}
          style={rectStyle(rect, fixtures.length + i)}
        >
          <RoomDrawing
            room={room}
            w={rect.w}
            h={rect.h}
            occupied={occupied}
            door={doorOf(room)}
            walls={walls.get(`r:${room.id}`)}
          />
        </button>
      ))}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Editor (Dean's Wards)
// ---------------------------------------------------------------------------

interface DragState {
  /** "r:<room id>" or "f:<fixture id>". */
  key: string;
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

/** Something being dragged in from the palette: an unplaced room or a new fixture. */
type PaletteItem = { type: "room"; room: Room } | { type: "fixture"; kind: WardFixtureKind };

interface PaletteDrag {
  item: PaletteItem;
  startX: number;
  startY: number;
  /** False until the pointer passes DRAG_SLOP; a release before that is a click. */
  moved: boolean;
  /** Where it would land, when the pointer is over the sheet. */
  preview: Rect | null;
  valid: boolean;
}

function paletteSize(item: PaletteItem): { w: number; h: number } {
  return item.type === "room" ? { w: NEW_W, h: NEW_H } : FIXTURE_SIZE[item.kind];
}

const NEXT_DOOR: Record<DoorSide, DoorSide> = { n: "e", e: "s", s: "w", w: "n" };
const DOOR_NAME: Record<DoorSide, string> = { n: "north", e: "east", s: "south", w: "west" };

function newId(): string {
  return crypto.randomUUID();
}

export function FloorPlanEditor({
  rooms,
  plan,
  occupancy,
  fixturesEnabled,
  onPlanChange,
  onEditRoom,
  onDeleteRoom,
  onRosterRoom,
}: {
  rooms: Room[];
  plan: PlanDraft;
  occupancy: Map<string, number>;
  /** False before migration 062: no doors to turn and no fixtures to place. */
  fixturesEnabled: boolean;
  onPlanChange: (next: PlanDraft) => void;
  /** Open the room's edit form; a click (no drag) selects and the bar offers it. */
  onEditRoom?: (room: Room) => void;
  /** Delete the room record itself — the caller owns the confirm. */
  onDeleteRoom?: (room: Room) => void;
  /** Open the room's student roster. */
  onRosterRoom?: (room: Room) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const placed = rooms.filter((r) => plan.rooms[r.id]);
  const unplaced = rooms.filter((r) => !plan.rooms[r.id]);
  // Derived from the plan, so a deletion elsewhere clears the bar by itself.
  const selectedRoom = selectedKey?.startsWith("r:")
    ? (rooms.find((r) => `r:${r.id}` === selectedKey && plan.rooms[r.id]) ?? null)
    : null;
  const selectedFixture = selectedKey?.startsWith("f:")
    ? (plan.fixtures.find((f) => `f:${f.id}` === selectedKey) ?? null)
    : null;

  const setRoomRect = (roomId: string, rect: Rect | null) =>
    onPlanChange({ ...plan, rooms: { ...plan.rooms, [roomId]: rect } });
  const setFixture = (id: string, patch: Partial<WardFixture>) =>
    onPlanChange({
      ...plan,
      fixtures: plan.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  const removeFixture = (id: string) =>
    onPlanChange({ ...plan, fixtures: plan.fixtures.filter((f) => f.id !== id) });

  const rectOfKey = (key: string): Rect | null => {
    if (key.startsWith("r:")) return plan.rooms[key.slice(2)] ?? null;
    const f = plan.fixtures.find((x) => `f:${x.id}` === key);
    return f ? fixtureRect(f) : null;
  };
  const kindOfKey = (key: string): WardFixtureKind | undefined =>
    key.startsWith("f:") ? plan.fixtures.find((x) => `f:${x.id}` === key)?.kind : undefined;

  const commitRect = (key: string, rect: Rect) => {
    if (key.startsWith("r:")) setRoomRect(key.slice(2), rect);
    else setFixture(key.slice(2), { plan_x: rect.x, plan_y: rect.y, plan_w: rect.w, plan_h: rect.h });
  };

  /** Grid cell size in px, from the live surface — resizes with the page. */
  const surfaceBox = () => {
    const el = surfaceRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cw: r.width / GRID_COLS, ch: r.height / GRID_ROWS };
  };

  // --- Moving and resizing what is already on the sheet ---------------------

  const startDrag = (e: React.PointerEvent, key: string, mode: DragState["mode"]) => {
    const origin = rectOfKey(key);
    if (!origin) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ key, mode, startX: e.clientX, startY: e.clientY, origin, preview: null, valid: true });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const box = surfaceBox();
    if (!box) return;
    const dx = Math.round((e.clientX - drag.startX) / box.cw);
    const dy = Math.round((e.clientY - drag.startY) / box.ch);
    if (dx === 0 && dy === 0 && !drag.preview) return;
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
    setDrag({ ...drag, preview: next, valid: !collides(next, plan, drag.key, kindOfKey(drag.key)) });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.preview && drag.valid) {
      commitRect(drag.key, drag.preview);
      setSelectedKey(drag.key);
    } else if (!drag.preview) {
      // The pointer never left its cell: that is a click, and clicks select.
      setSelectedKey((prev) => (prev === drag.key ? null : drag.key));
    }
    setDrag(null);
  };

  // --- Dragging something in from the palette ------------------------------

  const place = (item: PaletteItem, rect: Rect) => {
    if (item.type === "room") {
      setRoomRect(item.room.id, rect);
      setSelectedKey(`r:${item.room.id}`);
    } else {
      const id = newId();
      onPlanChange({
        ...plan,
        fixtures: [
          ...plan.fixtures,
          { id, kind: item.kind, label: "", plan_x: rect.x, plan_y: rect.y, plan_w: rect.w, plan_h: rect.h },
        ],
      });
      setSelectedKey(`f:${id}`);
    }
  };

  /** Click (or keyboard) path: the first free spot that fits. */
  const autoPlace = (item: PaletteItem) => {
    const spot = findFreeSpot(plan, item.type === "room" ? ROOM_SIZES : fixtureSizes(item.kind));
    if (spot) place(item, spot);
  };

  const startPaletteDrag = (e: React.PointerEvent, item: PaletteItem) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPaletteDrag({ item, startX: e.clientX, startY: e.clientY, moved: false, preview: null, valid: false });
  };

  const movePaletteDrag = (e: React.PointerEvent) => {
    if (!paletteDrag) return;
    const moved =
      paletteDrag.moved || Math.hypot(e.clientX - paletteDrag.startX, e.clientY - paletteDrag.startY) > DRAG_SLOP;
    const box = surfaceBox();
    const over =
      box && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
    if (!moved || !box || !over) {
      setPaletteDrag({ ...paletteDrag, moved, preview: null, valid: false });
      return;
    }
    // Centre the footprint on the pointer, snapped to the grid and kept on the sheet.
    const { w, h } = paletteSize(paletteDrag.item);
    const col = Math.floor((e.clientX - box.left) / box.cw);
    const row = Math.floor((e.clientY - box.top) / box.ch);
    const rect = {
      x: Math.min(Math.max(col - Math.floor(w / 2), 0), GRID_COLS - w),
      y: Math.min(Math.max(row - Math.floor(h / 2), 0), GRID_ROWS - h),
      w,
      h,
    };
    const kind = paletteDrag.item.type === "fixture" ? paletteDrag.item.kind : undefined;
    setPaletteDrag({ ...paletteDrag, moved, preview: rect, valid: !collides(rect, plan, "", kind) });
  };

  const endPaletteDrag = () => {
    if (!paletteDrag) return;
    if (!paletteDrag.moved) autoPlace(paletteDrag.item);
    else if (paletteDrag.preview && paletteDrag.valid) place(paletteDrag.item, paletteDrag.preview);
    setPaletteDrag(null);
  };

  const paletteHandlers = (item: PaletteItem) => ({
    onPointerDown: (e: React.PointerEvent) => startPaletteDrag(e, item),
    onPointerMove: movePaletteDrag,
    onPointerUp: endPaletteDrag,
    onPointerCancel: () => setPaletteDrag(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        autoPlace(item);
      }
    },
  });

  const roomSpotLeft = findFreeSpot(plan, ROOM_SIZES) !== null;

  // --- Rendering ------------------------------------------------------------

  const blockState = (key: string, isDragging: boolean) =>
    isDragging
      ? drag!.valid
        ? "z-20 ring-2 ring-emerald-500 ring-offset-1 ring-offset-[var(--plan-paper)]"
        : "z-20 ring-2 ring-rose-500 opacity-70"
      : selectedKey === key
        ? "z-10 ring-2 ring-brand-600 ring-offset-1 ring-offset-[var(--plan-paper)]"
        : "hover:z-10 hover:drop-shadow-[0_4px_10px_rgba(0,0,0,0.18)]";

  const dragHandlers = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, key, "move"),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: () => setDrag(null),
  });

  const resizeGrip = (key: string) => (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        startDrag(e, key, "resize");
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
      title="Drag to resize"
      className="absolute -bottom-1 -right-1 z-10 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-sm border border-[var(--plan-wall)] bg-[var(--plan-paper)] opacity-0 transition-opacity group-hover:opacity-80 hover:!opacity-100"
    />
  );

  // Walls follow what is on the sheet right now, the block being dragged
  // included, so they merge the moment a room is dropped against another.
  const liveRect = (key: string, rect: Rect) => (drag?.key === key && drag.preview) || rect;
  const walls = wallsFor(
    placed.map((room) => ({
      id: room.id,
      rect: liveRect(`r:${room.id}`, plan.rooms[room.id]!),
      door: plan.doors[room.id] ?? doorOf(room),
    })),
    plan.fixtures.map((f) => ({ id: f.id, kind: f.kind, rect: liveRect(`f:${f.id}`, fixtureRect(f)) })),
  );

  const barButton =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors";

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
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {fixturesEnabled && (
              <button
                onClick={() =>
                  onPlanChange({
                    ...plan,
                    doors: {
                      ...plan.doors,
                      [selectedRoom.id]: NEXT_DOOR[plan.doors[selectedRoom.id] ?? "s"],
                    },
                  })
                }
                title={`Door on the ${DOOR_NAME[plan.doors[selectedRoom.id] ?? "s"]} wall`}
                className={`${barButton} text-brand-700 hover:bg-brand-600/10`}
              >
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                Turn door
              </button>
            )}
            {onRosterRoom && (
              <button
                onClick={() => onRosterRoom(selectedRoom)}
                className={`${barButton} text-brand-700 hover:bg-brand-600/10`}
              >
                <FontAwesomeIcon icon={faUserPlus} className="h-3 w-3" />
                Students
              </button>
            )}
            {onEditRoom && (
              <button
                onClick={() => onEditRoom(selectedRoom)}
                className={`${barButton} text-brand-700 hover:bg-brand-600/10`}
              >
                <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                Edit
              </button>
            )}
            <button
              onClick={() => {
                setRoomRect(selectedRoom.id, null);
                setSelectedKey(null);
              }}
              className={`${barButton} text-gray-600 hover:bg-gray-100`}
            >
              <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
              Remove from plan
            </button>
            {onDeleteRoom && (
              <button
                onClick={() => onDeleteRoom(selectedRoom)}
                className={`${barButton} text-rose-600 hover:bg-rose-50`}
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                Delete
              </button>
            )}
            <button
              onClick={() => setSelectedKey(null)}
              title="Deselect"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {selectedFixture && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-600/30 bg-brand-600/5 px-3 py-2">
          <p className="text-sm font-semibold text-gray-900">{FIXTURE_LABEL[selectedFixture.kind]}</p>
          <input
            value={selectedFixture.label}
            onChange={(e) => setFixture(selectedFixture.id, { label: e.target.value.slice(0, 60) })}
            placeholder={
              selectedFixture.kind === "label" ? "Text to show on the plan" : `Name (default "${FIXTURE_LABEL[selectedFixture.kind]}")`
            }
            maxLength={60}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-2.5 py-1.5 text-sm text-gray-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 sm:max-w-xs"
          />
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                removeFixture(selectedFixture.id);
                setSelectedKey(null);
              }}
              className={`${barButton} text-rose-600 hover:bg-rose-50`}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              Remove
            </button>
            <button
              onClick={() => setSelectedKey(null)}
              title="Deselect"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div ref={surfaceRef}>
        <Surface onBackgroundPointerDown={() => setSelectedKey(null)}>
          {plan.fixtures.map((f) => {
            const key = `f:${f.id}`;
            const isDragging = drag?.key === key;
            const rect = (isDragging && drag.preview) || fixtureRect(f);
            return (
              <div
                key={f.id}
                {...dragHandlers(key)}
                className={`group absolute cursor-move touch-none select-none rounded-sm ${
                  f.kind === "label" ? "z-[5] outline-1 outline-dashed outline-gray-400/50" : ""
                } ${blockState(key, isDragging)}`}
                style={{ ...rectStyle(rect), transition: isDragging ? "none" : "left 80ms, top 80ms, width 80ms, height 80ms" }}
              >
                <FixtureDrawing
                  kind={f.kind}
                  label={f.label}
                  w={rect.w}
                  h={rect.h}
                  walls={walls.get(key)}
                />
                {resizeGrip(key)}
              </div>
            );
          })}
          {placed.map((room) => {
            const key = `r:${room.id}`;
            const isDragging = drag?.key === key;
            const rect = (isDragging && drag.preview) || plan.rooms[room.id]!;
            return (
              <div
                key={room.id}
                {...dragHandlers(key)}
                className={`group absolute cursor-move touch-none select-none rounded-sm ${blockState(key, isDragging)}`}
                style={{ ...rectStyle(rect), transition: isDragging ? "none" : "left 80ms, top 80ms, width 80ms, height 80ms" }}
              >
                <RoomDrawing
                  room={room}
                  w={rect.w}
                  h={rect.h}
                  occupied={occupancy.get(room.id) ?? 0}
                  door={plan.doors[room.id] ?? doorOf(room)}
                  walls={walls.get(key)}
                />
                {resizeGrip(key)}
              </div>
            );
          })}
          {paletteDrag?.preview && (
            <div
              className={`pointer-events-none absolute z-30 rounded-sm outline-2 outline-dashed ${
                paletteDrag.valid ? "outline-emerald-500" : "outline-rose-500"
              }`}
              style={rectStyle(paletteDrag.preview)}
            >
              <div className={paletteDrag.valid ? "opacity-70" : "opacity-40"}>
                {paletteDrag.item.type === "room" ? (
                  <RoomDrawing
                    room={paletteDrag.item.room}
                    w={paletteDrag.preview.w}
                    h={paletteDrag.preview.h}
                    occupied={occupancy.get(paletteDrag.item.room.id) ?? 0}
                    door={plan.doors[paletteDrag.item.room.id] ?? "s"}
                  />
                ) : (
                  <FixtureDrawing
                    kind={paletteDrag.item.kind}
                    label=""
                    w={paletteDrag.preview.w}
                    h={paletteDrag.preview.h}
                  />
                )}
              </div>
            </div>
          )}
          {placed.length === 0 && plan.fixtures.length === 0 && !paletteDrag?.preview && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="max-w-xs text-center text-sm text-[var(--plan-muted)]">
                An empty sheet — drag rooms and fixtures onto it from below, then arrange
                them.
              </p>
            </div>
          )}
        </Surface>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rooms not on the plan ({unplaced.length})
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
                  <span
                    role="button"
                    tabIndex={roomSpotLeft ? 0 : -1}
                    aria-disabled={!roomSpotLeft}
                    {...(roomSpotLeft ? paletteHandlers({ type: "room", room }) : {})}
                    title={roomSpotLeft ? "Drag onto the plan, or click to place" : "No free space left on the plan"}
                    className={`inline-flex touch-none select-none items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                      roomSpotLeft
                        ? "cursor-grab hover:bg-brand-600/5 hover:text-brand-700 active:cursor-grabbing"
                        : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <FontAwesomeIcon icon={faGripVertical} className="h-2.5 w-2.5 text-gray-300" />
                    {room.name} · {room.room_number}
                  </span>
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

        <div className="rounded-xl border border-hairline bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Add to the plan
          </p>
          {fixturesEnabled ? (
            <div className="flex flex-wrap gap-2">
              {WARD_FIXTURE_KINDS.map((kind) => (
                <span
                  key={kind}
                  role="button"
                  tabIndex={0}
                  {...paletteHandlers({ type: "fixture", kind })}
                  title="Drag onto the plan, or click to place"
                  className="inline-flex cursor-grab touch-none select-none items-center gap-2 rounded-lg border border-gray-200 bg-surface py-1 pl-1 pr-2.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-600/40 hover:bg-brand-600/5 hover:text-brand-700 active:cursor-grabbing"
                >
                  <span
                    className="relative block h-6 w-8 overflow-hidden rounded border border-hairline"
                    style={{ background: "var(--plan-paper)" }}
                    aria-hidden
                  >
                    <FixtureDrawing kind={kind} label={kind === "label" ? "Aa" : " "} w={4} h={3} />
                  </span>
                  {FIXTURE_LABEL[kind]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Corridors, stations and door placement arrive once database migration 062 is
              applied.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
