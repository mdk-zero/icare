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

const SIDES: DoorSide[] = ["n", "e", "s", "w"];
const OPPOSITE: Record<DoorSide, DoorSide> = { n: "s", s: "n", e: "w", w: "e" };
const horizontalSide = (side: DoorSide) => side === "n" || side === "s";

/** Fixtures drawn with walls of their own, which rooms can share. */
const WALLED_FIXTURES: ReadonlySet<WardFixtureKind> = new Set(["stairs", "elevator", "restroom", "storage"]);
/** Walled fixtures with a door; the rest (stairs, elevator) are closed boxes. */
const FIXTURE_DOOR: Partial<Record<WardFixtureKind, DoorSide>> = { restroom: "s", storage: "s" };

/** A walled block on the plan, in grid cells, for working out shared walls. */
export interface WallBlock {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: DoorSide | null;
}

/**
 * How one block draws its walls. A side it shares with a neighbour sits on
 * the shared edge instead of just inside it, so the two blocks draw the same
 * line and it reads as one wall, not two side by side. Gaps (plan units from
 * the side's top or left end) are its own door and any neighbour's door in
 * that shared wall.
 */
export interface WallSpec {
  flush: Record<DoorSide, boolean>;
  gaps: Record<DoorSide, [number, number][]>;
}

export function wallBlockForFixture(key: string, kind: WardFixtureKind, rect: { x: number; y: number; w: number; h: number }): WallBlock | null {
  return WALLED_FIXTURES.has(kind) ? { key, ...rect, door: FIXTURE_DOOR[kind] ?? null } : null;
}

/** The door's opening along its wall, in plan units from the wall's top/left end. */
function doorInterval(door: DoorSide, W: number, H: number): [number, number] {
  const L = horizontalSide(door) ? W : H;
  const gap = Math.min(8, L * 0.42);
  const near = Math.min(Math.max(3.4, L * 0.16 + INSET), L - gap - INSET - 0.5);
  // The label sits top-left, so doors in the top or left wall go to their far end.
  const start = door === "n" || door === "w" ? L - gap - near : near;
  return [start, start + gap];
}

/** The side of `b` that touches `o` edge to edge, if any. */
function touchingSide(b: WallBlock, o: WallBlock): DoorSide | null {
  const spanY = b.y < o.y + o.h && o.y < b.y + b.h;
  const spanX = b.x < o.x + o.w && o.x < b.x + b.w;
  if (spanY && b.x + b.w === o.x) return "e";
  if (spanY && o.x + o.w === b.x) return "w";
  if (spanX && b.y + b.h === o.y) return "s";
  if (spanX && o.y + o.h === b.y) return "n";
  return null;
}

function emptySpec(): WallSpec {
  return { flush: { n: false, e: false, s: false, w: false }, gaps: { n: [], e: [], s: [], w: [] } };
}

/** Every block's walls, given everything walled on the plan. */
export function planWalls(blocks: WallBlock[]): Map<string, WallSpec> {
  const out = new Map<string, WallSpec>();
  for (const b of blocks) {
    const spec = emptySpec();
    if (b.door) spec.gaps[b.door].push(doorInterval(b.door, b.w * U, b.h * U));
    for (const o of blocks) {
      if (o === b) continue;
      const side = touchingSide(b, o);
      if (!side) continue;
      spec.flush[side] = true;
      // A door in the neighbour's side of this wall opens through ours too.
      if (o.door === OPPOSITE[side]) {
        const [g0, g1] = doorInterval(o.door, o.w * U, o.h * U);
        const shift = horizontalSide(side) ? (o.x - b.x) * U : (o.y - b.y) * U;
        spec.gaps[side].push([g0 + shift, g1 + shift]);
      }
    }
    out.set(b.key, spec);
  }
  return out;
}

/** A block alone on the plan: every wall inset, only its own door. */
function soloSpec(w: number, h: number, door: DoorSide | null): WallSpec {
  return planWalls([{ key: "", x: 0, y: 0, w, h, door }]).get("")!;
}

const pt = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/**
 * The four walls, cut where doors open, and this block's own door leaf
 * standing open with the arc it sweeps.
 */
function Walls({ W, H, door, spec }: { W: number; H: number; door: DoorSide | null; spec: WallSpec }) {
  // Where each wall's centreline runs: on the edge when shared, else just inside.
  const line: Record<DoorSide, number> = {
    n: spec.flush.n ? 0 : INSET,
    s: spec.flush.s ? H : H - INSET,
    w: spec.flush.w ? 0 : INSET,
    e: spec.flush.e ? W : W - INSET,
  };
  const at = (side: DoorSide, t: number): [number, number] =>
    horizontalSide(side) ? [t, line[side]] : [line[side], t];
  const half = WALL / 2;

  const runs: { side: DoorSide; from: number; to: number }[] = [];
  for (const side of SIDES) {
    // Each wall runs past the corners by half its thickness, so they meet square.
    let segs: [number, number][] = horizontalSide(side)
      ? [[line.w - half, line.e + half]]
      : [[line.n - half, line.s + half]];
    for (const [g0, g1] of spec.gaps[side]) {
      segs = segs.flatMap(([a, b]): [number, number][] =>
        g1 <= a || g0 >= b
          ? [[a, b]]
          : ([[a, Math.min(g0, b)], [Math.max(g1, a), b]] as [number, number][]).filter(([x, y]) => y - x > 0.05),
      );
    }
    for (const [from, to] of segs) runs.push({ side, from, to });
  }

  let doorLeaf: React.ReactNode = null;
  if (door) {
    const [g0, g1] = doorInterval(door, W, H);
    const gap = g1 - g0;
    const inward: [number, number] = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[door] as [number, number];
    const along: [number, number] = horizontalSide(door) ? [1, 0] : [0, 1];
    const hinge = at(door, g0);
    const gapEnd = at(door, g1);
    const tip: [number, number] = [hinge[0] + inward[0] * gap, hinge[1] + inward[1] * gap];
    // Clockwise (SVG sweep 1) when turning from "inward" to "along" is.
    const sweep = inward[0] * along[1] - inward[1] * along[0] > 0 ? 1 : 0;
    doorLeaf = (
      <>
        <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke="var(--plan-wall)" strokeWidth={0.7} />
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

  return (
    <>
      <path
        d={runs
          .map(({ side, from, to }) => `M ${pt(at(side, from))} L ${pt(at(side, to))}`)
          .join(" ")}
        fill="none"
        stroke="var(--plan-wall)"
        strokeWidth={WALL}
        strokeLinecap="butt"
      />
      {doorLeaf}
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
  walls,
}: {
  room: Room;
  /** Size in grid cells. */
  w: number;
  h: number;
  occupied: number;
  door: DoorSide;
  /** Shared walls with its neighbours, from planWalls; alone on the plan if omitted. */
  walls?: WallSpec;
}) {
  const hatchId = useId();
  const W = w * U;
  const H = h * U;
  const tone = toneOf(room, occupied);
  const offline = tone === "offline";

  // Beds keep clear of the label band at the top and the door's swing.
  const [g0, g1] = doorInterval(door, W, H);
  const swing = g1 - g0 + 1;
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
        <Walls W={W} H={H} door={door} spec={walls ?? soloSpec(w, h, door)} />
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
  walls,
}: {
  kind: WardFixtureKind;
  label: string;
  w: number;
  h: number;
  /** Shared walls, for the walled kinds; alone on the plan if omitted. */
  walls?: WallSpec;
}) {
  const W = w * U;
  const H = h * U;
  const fixtureDoor = FIXTURE_DOOR[kind] ?? null;
  const fixtureWalls = <Walls W={W} H={H} door={fixtureDoor} spec={walls ?? soloSpec(w, h, fixtureDoor)} />;
  const text = label || (kind === "label" ? "" : FIXTURE_LABEL[kind]);
  const horizontal = W >= H;
  const line = { stroke: "var(--plan-line)", strokeWidth: 0.5, fill: "none" } as const;

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
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill="var(--plan-paper)" />
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
          {fixtureWalls}
        </>
      );
      break;
    }
    case "elevator":
      body = (
        <>
          <rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill="var(--plan-paper)" />
          <path d={`M ${W * 0.2} ${H * 0.2} L ${W * 0.8} ${H * 0.8} M ${W * 0.8} ${H * 0.2} L ${W * 0.2} ${H * 0.8}`} {...line} />
          {fixtureWalls}
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
          {fixtureWalls}
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
