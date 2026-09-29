"use client";

import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faWrench } from "@fortawesome/free-solid-svg-icons";
import type { DoorSide, Room, WardFixtureKind } from "../lib/api";
import { roomStatus } from "../lib/rooms";

/**
 * The floor plan drawn as an architect would: walled rooms with a door and
 * their beds, and the corridors, stations and stairs between them. Geometry
 * is SVG in "plan units" (10 per grid cell, so cells stay square); text sits
 * in HTML on top so it stays crisp at every size. Colours come from the
 * --plan-* tokens in globals.css, which the dark theme turns into a blueprint.
 */

/** Plan units per grid cell. */
const U = 10;
/** Wall centreline inset from the block edge, and its stroke. */
const INSET = 0.9;
const WALL = 1.8;

type Tone = "available" | "crowded" | "full" | "offline";

export const FIXTURE_LABEL: Record<WardFixtureKind, string> = {
  corridor: "Corridor",
  nurse_station: "Nurse Station",
  stairs: "Stairs",
  elevator: "Elevator",
  restroom: "Restroom",
  storage: "Storage",
  label: "Label",
};

/** Footprint a fixture is dropped at, in cells. */
export const FIXTURE_SIZE: Record<WardFixtureKind, { w: number; h: number }> = {
  corridor: { w: 8, h: 2 },
  nurse_station: { w: 3, h: 2 },
  stairs: { w: 2, h: 3 },
  elevator: { w: 2, h: 2 },
  restroom: { w: 2, h: 2 },
  storage: { w: 2, h: 2 },
  label: { w: 4, h: 1 },
};

interface Side {
  /** Where the wall starts, the direction it runs, and which way is inside. */
  start: [number, number];
  along: [number, number];
  inward: [number, number];
  length: number;
}

function sideOf(door: DoorSide, W: number, H: number): Side {
  const i = INSET;
  switch (door) {
    case "n":
      return { start: [i, i], along: [1, 0], inward: [0, 1], length: W - 2 * i };
    case "s":
      return { start: [i, H - i], along: [1, 0], inward: [0, -1], length: W - 2 * i };
    case "w":
      return { start: [i, i], along: [0, 1], inward: [1, 0], length: H - 2 * i };
    case "e":
      return { start: [W - i, i], along: [0, 1], inward: [-1, 0], length: H - 2 * i };
  }
}

const add = (p: [number, number], v: [number, number], k: number): [number, number] => [
  p[0] + v[0] * k,
  p[1] + v[1] * k,
];
const pt = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/**
 * The four walls with a gap for the door, the door leaf standing open and its
 * swing. Returns the gap so beds can keep clear of it.
 */
function WallsWithDoor({ W, H, door }: { W: number; H: number; door: DoorSide }) {
  const i = INSET;
  const side = sideOf(door, W, H);
  const gap = Math.min(8, side.length * 0.42);
  const near = Math.min(Math.max(2.5, side.length * 0.16), side.length - gap - 1);
  // The label sits top-left, so doors in the top or left wall go to its far end.
  const offset = door === "n" || door === "w" ? side.length - gap - near : near;
  const hinge = add(side.start, side.along, offset);
  const gapEnd = add(hinge, side.along, gap);
  const tip = add(hinge, side.inward, gap);
  const sideEnd = add(side.start, side.along, side.length);
  // Clockwise (SVG sweep 1) when turning from "inward" to "along" is.
  const sweep = side.inward[0] * side.along[1] - side.inward[1] * side.along[0] > 0 ? 1 : 0;

  // Walls as one path: from the far side of the gap, on round the room, back
  // to the hinge. These are the two corners that are neither end of the
  // door's wall, in the order the path meets them.
  const TL: [number, number] = [i, i];
  const TR: [number, number] = [W - i, i];
  const BR: [number, number] = [W - i, H - i];
  const BL: [number, number] = [i, H - i];
  const between: Record<DoorSide, [number, number][]> = {
    n: [BR, BL],
    e: [BL, TL],
    s: [TR, TL],
    w: [BR, TR],
  };
  const outline = [gapEnd, sideEnd, ...between[door], side.start, hinge];

  return (
    <>
      <path
        d={`M ${outline.map(pt).join(" L ")}`}
        fill="none"
        stroke="var(--plan-wall)"
        strokeWidth={WALL}
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      {/* Door leaf, open at 90°, and the arc it sweeps. */}
      <line
        x1={hinge[0]}
        y1={hinge[1]}
        x2={tip[0]}
        y2={tip[1]}
        stroke="var(--plan-wall)"
        strokeWidth={0.7}
      />
      <path
        d={`M ${pt(tip)} A ${gap} ${gap} 0 0 ${sweep} ${pt(gapEnd)}`}
        fill="none"
        stroke="var(--plan-line)"
        strokeWidth={0.45}
        strokeDasharray="1.2 0.9"
      />
    </>
  );
}

/** One bed from above: a frame, a pillow, and a folded blanket line. */
function Bed({
  x,
  y,
  w,
  h,
  filled,
  tone,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  filled: boolean;
  tone: Tone;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={w * 0.18}
        fill={filled ? `var(--plan-bed-${tone})` : "var(--plan-paper)"}
        stroke={filled ? `var(--plan-bed-${tone})` : "var(--plan-line)"}
        strokeWidth={0.4}
      />
      <rect
        x={x + w * 0.16}
        y={y + h * 0.07}
        width={w * 0.68}
        height={h * 0.18}
        rx={w * 0.12}
        fill={filled ? "var(--plan-paper)" : "none"}
        fillOpacity={filled ? 0.85 : 1}
        stroke={filled ? "none" : "var(--plan-line)"}
        strokeWidth={0.3}
      />
      <line
        x1={x + w * 0.08}
        x2={x + w * 0.92}
        y1={y + h * 0.42}
        y2={y + h * 0.42}
        stroke={filled ? "var(--plan-paper)" : "var(--plan-line)"}
        strokeOpacity={filled ? 0.7 : 0.6}
        strokeWidth={0.3}
      />
    </g>
  );
}

/**
 * Lays `count` beds out in the free area, picking the column count that gives
 * the largest bed. Returns null when they would be too small to read, so the
 * room shows a count instead.
 */
function bedGrid(count: number, area: { x: number; y: number; w: number; h: number }) {
  if (count <= 0 || area.w <= 0 || area.h <= 0) return null;
  let best: { cols: number; rows: number; bw: number } | null = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    // A bed is 1 wide by 2 long, with a third of a bed between neighbours.
    const bw = Math.min(area.w / (cols * 1.35), area.h / (rows * 2.35), 4.2);
    if (!best || bw > best.bw) best = { cols, rows, bw };
  }
  if (!best || best.bw < 1.6) return null;
  const { cols, rows, bw } = best;
  const bh = bw * 2;
  const gapX = cols > 1 ? Math.min(bw * 0.9, (area.w - cols * bw) / (cols - 1)) : 0;
  const gapY = rows > 1 ? Math.min(bw * 0.6, (area.h - rows * bh) / (rows - 1)) : 0;
  const totalW = cols * bw + (cols - 1) * gapX;
  const totalH = rows * bh + (rows - 1) * gapY;
  const x0 = area.x + (area.w - totalW) / 2;
  const y0 = area.y + (area.h - totalH) / 2;
  return Array.from({ length: count }, (_, n) => ({
    x: x0 + (n % cols) * (bw + gapX),
    y: y0 + Math.floor(n / cols) * (bh + gapY),
    w: bw,
    h: bh,
  }));
}

function toneOf(room: Room, occupied: number): Tone {
  return room.status !== "active" ? "offline" : roomStatus(occupied, room.capacity);
}

/** A room as drawn on the plan: floor, walls, door, beds, and its label. */
export function RoomDrawing({
  room,
  w,
  h,
  occupied,
  door,
}: {
  room: Room;
  /** Size in grid cells. */
  w: number;
  h: number;
  occupied: number;
  door: DoorSide;
}) {
  const hatchId = useId();
  const W = w * U;
  const H = h * U;
  const tone = toneOf(room, occupied);
  const offline = tone === "offline";

  // Beds keep clear of the label band at the top and the door's swing.
  const side = sideOf(door, W, H);
  const swing = Math.min(8, side.length * 0.42) + 1;
  const label = Math.min(8.5, H * 0.42);
  const pad = 2.6;
  const area = {
    x: pad + (door === "w" ? swing : 0),
    y: Math.max(label, door === "n" ? swing : 0),
    w: W - 2 * pad - (door === "w" || door === "e" ? swing : 0),
    h: H - Math.max(label, door === "n" ? swing : 0) - pad - (door === "s" ? swing : 0),
  };
  const beds = offline ? null : bedGrid(room.capacity, area);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {offline && (
          <defs>
            <pattern id={hatchId} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke="var(--plan-line)" strokeOpacity="0.35" strokeWidth="0.6" />
            </pattern>
          </defs>
        )}
        <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={`var(--plan-floor-${tone})`} />
        {offline && (
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={`url(#${hatchId})`} />
        )}
        {beds?.map((b, n) => (
          <Bed key={n} {...b} filled={n < occupied} tone={tone} />
        ))}
        <WallsWithDoor W={W} H={H} door={door} />
      </svg>
      {/* Inside the walls, which are about a fifth of a cell thick. */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-1 overflow-hidden px-[7px] py-[6px] text-left sm:px-2.5 sm:py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold leading-tight text-[var(--plan-ink)]">
            {room.name}
          </p>
          <p className="truncate font-mono text-[9px] uppercase tracking-wider text-[var(--plan-muted)]">
            Rm {room.room_number}
          </p>
        </div>
        {offline ? (
          <span
            title={room.status}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-gray-500 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
          >
            <FontAwesomeIcon icon={room.status === "maintenance" ? faWrench : faBan} className="h-2 w-2" />
            <span className="hidden sm:inline">{room.status}</span>
          </span>
        ) : (
          <span
            className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-semibold leading-none text-white"
            style={{ background: `var(--plan-bed-${tone})` }}
          >
            {occupied}/{room.capacity}
            {!beds && room.capacity > 0 ? " beds" : ""}
          </span>
        )}
      </div>
    </>
  );
}

/** Everything that is not a room, as line-drawn plan symbols. */
export function FixtureDrawing({
  kind,
  label,
  w,
  h,
}: {
  kind: WardFixtureKind;
  label: string;
  w: number;
  h: number;
}) {
  const W = w * U;
  const H = h * U;
  const text = label || (kind === "label" ? "" : FIXTURE_LABEL[kind]);
  const horizontal = W >= H;
  const line = { stroke: "var(--plan-line)", strokeWidth: 0.5, fill: "none" } as const;
  const wall = { stroke: "var(--plan-wall)", strokeWidth: WALL * 0.8, fill: "none" } as const;

  let body: React.ReactNode = null;
  switch (kind) {
    case "corridor":
      body = (
        <>
          <rect x={0} y={0} width={W} height={H} fill="var(--plan-corridor)" />
          {horizontal ? (
            <line x1={2} x2={W - 2} y1={H / 2} y2={H / 2} {...line} strokeDasharray="3 2" />
          ) : (
            <line y1={2} y2={H - 2} x1={W / 2} x2={W / 2} {...line} strokeDasharray="3 2" />
          )}
        </>
      );
      break;
    case "nurse_station": {
      // An L-shaped counter along two sides with a chair behind it.
      const t = Math.min(W, H) * 0.22;
      body = (
        <>
          <rect x={0} y={0} width={W} height={H} fill="var(--plan-corridor)" />
          <path
            d={`M ${W * 0.08} ${H * 0.3} L ${W * 0.08} ${H * 0.92} L ${W * 0.92} ${H * 0.92} L ${W * 0.92} ${H * 0.92 - t} L ${W * 0.08 + t} ${H * 0.92 - t} L ${W * 0.08 + t} ${H * 0.3} Z`}
            fill="var(--plan-floor-available)"
            stroke="var(--plan-wall)"
            strokeWidth={0.7}
          />
          <circle cx={W * 0.62} cy={H * 0.5} r={Math.min(W, H) * 0.1} {...line} />
        </>
      );
      break;
    }
    case "stairs": {
      const treads = Math.max(3, Math.round((horizontal ? W : H) / 2.2));
      body = (
        <>
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} {...wall} fill="var(--plan-paper)" />
          {Array.from({ length: treads - 1 }, (_, n) => {
            const k = ((n + 1) / treads) * (horizontal ? W : H);
            return horizontal ? (
              <line key={n} x1={k} x2={k} y1={INSET} y2={H - INSET} {...line} />
            ) : (
              <line key={n} y1={k} y2={k} x1={INSET} x2={W - INSET} {...line} />
            );
          })}
          {horizontal ? (
            <path d={`M ${W * 0.12} ${H / 2} L ${W * 0.85} ${H / 2} M ${W * 0.78} ${H * 0.36} L ${W * 0.86} ${H / 2} L ${W * 0.78} ${H * 0.64}`} {...line} strokeWidth={0.7} />
          ) : (
            <path d={`M ${W / 2} ${H * 0.88} L ${W / 2} ${H * 0.15} M ${W * 0.36} ${H * 0.22} L ${W / 2} ${H * 0.14} L ${W * 0.64} ${H * 0.22}`} {...line} strokeWidth={0.7} />
          )}
        </>
      );
      break;
    }
    case "elevator":
      body = (
        <>
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} {...wall} fill="var(--plan-paper)" />
          <path d={`M ${W * 0.2} ${H * 0.2} L ${W * 0.8} ${H * 0.8} M ${W * 0.8} ${H * 0.2} L ${W * 0.2} ${H * 0.8}`} {...line} />
        </>
      );
      break;
    case "restroom":
    case "storage":
      body = (
        <>
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill="var(--plan-corridor)" />
          {kind === "storage" &&
            Array.from({ length: Math.ceil((W + H) / 3) }, (_, n) => (
              <line key={n} x1={n * 3} y1={0} x2={n * 3 - H} y2={H} {...line} strokeOpacity={0.35} />
            ))}
          {kind === "restroom" && (
            <g {...line} strokeWidth={0.55}>
              <circle cx={W * 0.36} cy={H * 0.55} r={Math.min(W, H) * 0.07} />
              <path d={`M ${W * 0.36} ${H * 0.62} L ${W * 0.36} ${H * 0.8}`} />
              <circle cx={W * 0.64} cy={H * 0.55} r={Math.min(W, H) * 0.07} />
              <path d={`M ${W * 0.56} ${H * 0.82} L ${W * 0.64} ${H * 0.62} L ${W * 0.72} ${H * 0.82} Z`} />
            </g>
          )}
          <WallsWithDoor W={W} H={H} door="s" />
        </>
      );
      break;
    case "label":
      body = null;
      break;
  }

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-hidden" aria-hidden>
        {body}
      </svg>
      {text && (
        <div
          className={`pointer-events-none absolute inset-0 flex overflow-hidden ${
            kind === "label" || kind === "corridor"
              ? "items-center justify-center p-1"
              : "items-start px-[7px] py-[6px] sm:px-2.5 sm:py-2"
          }`}
        >
          <span
            className={`truncate font-mono uppercase text-[var(--plan-muted)] ${
              kind === "label"
                ? "text-[11px] font-semibold tracking-[0.2em] text-[var(--plan-ink)]"
                : "text-[9px] tracking-wider"
            } ${
              kind === "corridor"
                ? "rounded bg-[var(--plan-corridor)] px-1"
                : kind === "label"
                  ? ""
                  : "rounded-sm bg-[var(--plan-paper)] px-0.5"
            }`}
          >
            {text}
          </span>
        </div>
      )}
    </>
  );
}
