/**
 * Floor-plan geometry, ported from the web's FloorPlanDrawing.tsx so the phone
 * draws the Dean's ward plan wall for wall: shared walls, where each door
 * lands, and how beds fit a room. Pure functions only; the drawing lives in
 * components/FloorPlan.tsx. Keep the two copies in step.
 */

import type { DoorSide, WardFixtureKind } from '@/lib/api';

/** The plan's grid, in cells (web: GRID_COLS × GRID_ROWS). */
export const GRID_COLS = 24;
export const GRID_ROWS = 16;

/** Plan units per grid cell. */
export const U = 10;
/** Wall centreline inset from the block edge, and its stroke. */
export const INSET = 0.9;
export const WALL = 1.8;

export const FIXTURE_LABEL: Record<WardFixtureKind, string> = {
  corridor: 'Corridor',
  nurse_station: 'Nurse Station',
  stairs: 'Stairs',
  elevator: 'Elevator',
  restroom: 'Restroom',
  storage: 'Storage',
  label: 'Label',
};

const SIDES: DoorSide[] = ['n', 'e', 's', 'w'];
const OPPOSITE: Record<DoorSide, DoorSide> = { n: 's', s: 'n', e: 'w', w: 'e' };

export const horizontalSide = (side: DoorSide) => side === 'n' || side === 's';

/** Fixtures drawn with walls of their own, which rooms can share. */
export const WALLED_FIXTURES: ReadonlySet<WardFixtureKind> = new Set(['stairs', 'elevator', 'restroom', 'storage']);
/** Walled fixtures with a door; the rest (stairs, elevator) are closed boxes. */
export const FIXTURE_DOOR: Partial<Record<WardFixtureKind, DoorSide>> = { restroom: 's', storage: 's' };

/** A walled block on the plan, in grid cells, for working out shared walls. */
export interface WallBlock {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: DoorSide | null;
}

/** Where a block's door ended up: its wall, and its opening along it. */
export interface DoorPlacement {
  side: DoorSide;
  /** Plan units from the wall's top or left end. */
  start: number;
  end: number;
  /** The chosen wall was blocked, so the door stands on another one for now. */
  moved: boolean;
  /** Every wall is blocked, so the door opens into a neighbour on the chosen wall. */
  connecting: boolean;
}

/** What is on the other side of one of a block's walls. */
export interface SideInfo {
  /** Neighbours (by block key) that this wall touches. */
  neighbors: string[];
  /** The wall is on the sheet's outer edge. */
  edge: boolean;
  /** No stretch of it is free of neighbours for a door to fit. */
  blocked: boolean;
}

/**
 * How one block draws its walls. On the plan every wall is centred on its
 * grid line ('flush'), so walls that continue one another line up and two
 * blocks that touch draw one wall, not two side by side. Only walls on the
 * sheet's outer edge sit just inside it, all of them alike. Gaps (plan units
 * from the side's top or left end) are its own door and any neighbour's door
 * in a shared wall.
 */
export interface WallSpec {
  flush: Record<DoorSide, boolean>;
  gaps: Record<DoorSide, [number, number][]>;
  door: DoorPlacement | null;
  sides: Record<DoorSide, SideInfo>;
}

export function wallBlockForFixture(key: string, kind: WardFixtureKind, rect: { x: number; y: number; w: number; h: number }): WallBlock | null {
  return WALLED_FIXTURES.has(kind) ? { key, ...rect, door: FIXTURE_DOOR[kind] ?? null } : null;
}

/** A door is at most this wide, and never narrower than MIN_DOOR. */
const MAX_DOOR = 8;
const MIN_DOOR = 5;
/** Clearance a door keeps from the room's corners, and from where a neighbour's wall meets its own. */
const CORNER_CLEAR = 2.4;
const JUNCTION_CLEAR = 1.5;

/** The side of `b` that touches `o` edge to edge, if any. */
function touchingSide(b: WallBlock, o: WallBlock): DoorSide | null {
  const spanY = b.y < o.y + o.h && o.y < b.y + b.h;
  const spanX = b.x < o.x + o.w && o.x < b.x + b.w;
  if (spanY && b.x + b.w === o.x) return 'e';
  if (spanY && o.x + o.w === b.x) return 'w';
  if (spanX && b.y + b.h === o.y) return 's';
  if (spanX && o.y + o.h === b.y) return 'n';
  return null;
}

/** The stretch of `b`'s side that `o` covers, in plan units along that side. */
function coveredSpan(b: WallBlock, o: WallBlock, side: DoorSide): [number, number] {
  return horizontalSide(side)
    ? [(Math.max(b.x, o.x) - b.x) * U, (Math.min(b.x + b.w, o.x + o.w) - b.x) * U]
    : [(Math.max(b.y, o.y) - b.y) * U, (Math.min(b.y + b.h, o.y + o.h) - b.y) * U];
}

/** [a, b] with the given spans cut out of it. */
export function subtract(range: [number, number], cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [range];
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]): [number, number][] =>
      c1 <= a || c0 >= b
        ? [[a, b]]
        : ([[a, Math.min(c0, b)], [Math.max(c1, a), b]] as [number, number][]).filter(([x, y]) => y - x > 0.05),
    );
  }
  return out;
}

/**
 * The door's opening on one wall, or null if no free stretch fits one. It
 * aims for the usual spot (nearer the start of the bottom and right walls,
 * the far end of the top and left ones, clear of the label) and slides to the
 * nearest stretch no neighbour's wall is behind.
 */
function doorOnSide(side: DoorSide, L: number, free: [number, number][]): [number, number] | null {
  const want = Math.min(MAX_DOOR, L * 0.42);
  const near = Math.max(3.4, L * 0.16 + INSET);
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const [a, b] of free) {
    const gap = Math.min(want, b - a);
    if (gap < MIN_DOOR) continue;
    const preferred = side === 'n' || side === 'w' ? L - gap - near : near;
    const start = Math.min(Math.max(preferred, a), b - gap);
    const distance = Math.abs(start - preferred);
    if (distance < bestDistance) {
      best = [start, start + gap];
      bestDistance = distance;
    }
  }
  return best;
}

/** The usual spot on a wall, ignoring neighbours: for a door with nowhere free to go. */
function defaultDoor(side: DoorSide, L: number): [number, number] {
  return doorOnSide(side, L, [[CORNER_CLEAR, L - CORNER_CLEAR]]) ?? [L / 2 - 1, L / 2 + 1];
}

const NEXT_SIDE: Record<DoorSide, DoorSide> = { n: 'e', e: 's', s: 'w', w: 'n' };

/** Every block's walls and door, given everything walled on a sheet of cols × rows cells. */
export function planWalls(blocks: WallBlock[], sheet: { cols: number; rows: number }): Map<string, WallSpec> {
  const out = new Map<string, WallSpec>();

  // First where each door goes; it depends only on the walls around it.
  for (const b of blocks) {
    const flush = { n: b.y > 0, w: b.x > 0, s: b.y + b.h < sheet.rows, e: b.x + b.w < sheet.cols };
    const sides = {} as Record<DoorSide, SideInfo>;
    const openings = {} as Record<DoorSide, [number, number] | null>;
    for (const side of SIDES) {
      const L = (horizontalSide(side) ? b.w : b.h) * U;
      const touching = blocks.filter((o) => o !== b && touchingSide(b, o) === side);
      const cuts = touching.map((o): [number, number] => {
        const [c0, c1] = coveredSpan(b, o, side);
        return [c0 - JUNCTION_CLEAR, c1 + JUNCTION_CLEAR];
      });
      openings[side] = doorOnSide(side, L, subtract([CORNER_CLEAR, L - CORNER_CLEAR], cuts));
      sides[side] = { neighbors: touching.map((o) => o.key), edge: !flush[side], blocked: !openings[side] };
    }

    let door: DoorPlacement | null = null;
    if (b.door) {
      const chosen = openings[b.door];
      if (chosen) {
        door = { side: b.door, start: chosen[0], end: chosen[1], moved: false, connecting: false };
      } else {
        // Try the other walls, going round from the chosen one; an inside
        // wall beats one on the building's outer edge.
        const order = [NEXT_SIDE[b.door], NEXT_SIDE[NEXT_SIDE[b.door]], NEXT_SIDE[NEXT_SIDE[NEXT_SIDE[b.door]]]];
        const pick =
          order.find((sd) => openings[sd] && !sides[sd].edge) ?? order.find((sd) => openings[sd]);
        if (pick) {
          const [start, end] = openings[pick]!;
          door = { side: pick, start, end, moved: true, connecting: false };
        } else {
          const L = (horizontalSide(b.door) ? b.w : b.h) * U;
          const [start, end] = defaultDoor(b.door, L);
          door = { side: b.door, start, end, moved: false, connecting: true };
        }
      }
    }
    out.set(b.key, { flush, gaps: { n: [], e: [], s: [], w: [] }, door, sides });
  }

  // Then the gaps: each block's own door, and any neighbour's door that opens
  // through a wall they share.
  for (const b of blocks) {
    const spec = out.get(b.key)!;
    if (spec.door) spec.gaps[spec.door.side].push([spec.door.start, spec.door.end]);
    for (const o of blocks) {
      if (o === b) continue;
      const side = touchingSide(b, o);
      const theirs = out.get(o.key)!.door;
      if (!side || theirs?.side !== OPPOSITE[side]) continue;
      const shift = horizontalSide(side) ? (o.x - b.x) * U : (o.y - b.y) * U;
      spec.gaps[side].push([theirs.start + shift, theirs.end + shift]);
    }
  }
  return out;
}

/** A block drawn on its own (palette chips, drop previews): every wall inset. */
export function soloSpec(w: number, h: number, door: DoorSide | null): WallSpec {
  return planWalls([{ key: '', x: 0, y: 0, w, h, door }], { cols: w, rows: h }).get('')!;
}


/**
 * Lays `count` beds out in the free area, picking the column count that gives
 * the largest bed. Returns null when they would be too small to read, so the
 * room shows a count instead.
 */
export function bedGrid(count: number, area: { x: number; y: number; w: number; h: number }) {
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
