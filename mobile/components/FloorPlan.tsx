import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Path, Circle, G, Defs, Pattern, ClipPath } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import type { DoorSide, WardFixture, WardRoom } from '@/lib/api';
import { roomStatus } from '@/lib/rooms';
import {
  FIXTURE_DOOR,
  FIXTURE_LABEL,
  GRID_COLS,
  GRID_ROWS,
  INSET,
  U,
  WALL,
  bedGrid,
  horizontalSide,
  planWalls,
  soloSpec,
  subtract,
  wallBlockForFixture,
  type WallBlock,
  type WallSpec,
} from '@/lib/floor-plan';

/**
 * The Dean's ward floor plan, as the Wards tab and faculty Monitoring draw it:
 * walled rooms with their door and beds (filled by occupancy), and the
 * corridors, stations and stairs between them. The student's own room is
 * outlined, and tapping a room opens it.
 *
 * A phone is too narrow for the whole 24 × 16 sheet at a readable size, so
 * cells never shrink below MIN_CELL and the sheet scrolls sideways, opening
 * on the student's room. On an iPad it fits the width.
 */

/** Smallest cell, in points, that keeps a room's name readable. */
const MIN_CELL = 30;

type Tone = 'available' | 'crowded' | 'full' | 'offline';

/** The web's --plan-* tokens: drafting paper in light mode, a blueprint in dark. */
const PLAN_COLORS = {
  light: {
    paper: '#fbfaf5',
    grid: 'rgba(64, 76, 84, 0.07)',
    gridMajor: 'rgba(64, 76, 84, 0.15)',
    wall: '#26313a',
    line: '#6b7780',
    ink: '#1c252c',
    muted: '#5d6970',
    corridor: '#efeee6',
    floor: { available: '#e3f4ea', crowded: '#fbf0d9', full: '#fbe3e6', offline: '#eceeef' },
    bed: { available: '#059669', crowded: '#d97706', full: '#e11d48', offline: '#6b7280' },
    tag: 'rgba(251, 250, 245, 0.85)',
    mine: '#1B6B7B',
  },
  dark: {
    paper: '#0c2533',
    grid: 'rgba(125, 211, 236, 0.07)',
    gridMajor: 'rgba(125, 211, 236, 0.16)',
    wall: '#cdeff7',
    line: '#7fb3c4',
    ink: '#e6f6fa',
    muted: '#93bccb',
    corridor: '#0f2f40',
    floor: {
      available: 'rgba(16, 185, 129, 0.16)',
      crowded: 'rgba(245, 158, 11, 0.17)',
      full: 'rgba(244, 63, 94, 0.18)',
      offline: 'rgba(148, 163, 184, 0.1)',
    },
    bed: { available: '#10b981', crowded: '#f59e0b', full: '#f43f5e', offline: '#64748b' },
    tag: 'rgba(12, 37, 51, 0.85)',
    mine: '#5FA6B8',
  },
};
type PlanColors = (typeof PLAN_COLORS)['light'];

interface Rect4 {
  x: number;
  y: number;
  w: number;
  h: number;
}

function roomRect(room: WardRoom): Rect4 | null {
  if (room.plan_x == null || room.plan_y == null || room.plan_w == null || room.plan_h == null) return null;
  return { x: room.plan_x, y: room.plan_y, w: room.plan_w, h: room.plan_h };
}

const doorOf = (room: WardRoom): DoorSide => room.plan_door ?? 's';

function toneOf(room: WardRoom): Tone {
  return room.status !== 'active' ? 'offline' : roomStatus(room.occupied, room.capacity);
}

const pt = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** The four walls, cut where doors open, and this block's own door standing open with its swing. */
function Walls({ W, H, spec, c }: { W: number; H: number; spec: WallSpec; c: PlanColors }) {
  const line: Record<DoorSide, number> = {
    n: spec.flush.n ? 0 : INSET,
    s: spec.flush.s ? H : H - INSET,
    w: spec.flush.w ? 0 : INSET,
    e: spec.flush.e ? W : W - INSET,
  };
  const at = (side: DoorSide, t: number): [number, number] =>
    horizontalSide(side) ? [t, line[side]] : [line[side], t];
  const half = WALL / 2;

  const runs: string[] = [];
  for (const side of ['n', 'e', 's', 'w'] as DoorSide[]) {
    // Each wall runs past the corners by half its thickness, so they meet square.
    const whole: [number, number] = horizontalSide(side)
      ? [line.w - half, line.e + half]
      : [line.n - half, line.s + half];
    for (const [from, to] of subtract(whole, spec.gaps[side])) {
      runs.push(`M ${pt(at(side, from))} L ${pt(at(side, to))}`);
    }
  }

  let leaf: React.ReactNode = null;
  if (spec.door) {
    const { side, start: g0, end: g1 } = spec.door;
    const gap = g1 - g0;
    const inward = ({ n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] } as const)[side];
    const along: [number, number] = horizontalSide(side) ? [1, 0] : [0, 1];
    const hinge = at(side, g0);
    const gapEnd = at(side, g1);
    const tip: [number, number] = [hinge[0] + inward[0] * gap, hinge[1] + inward[1] * gap];
    const sweep = inward[0] * along[1] - inward[1] * along[0] > 0 ? 1 : 0;
    leaf = (
      <>
        <Line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke={c.wall} strokeWidth={0.7} />
        <Path
          d={`M ${pt(tip)} A ${gap} ${gap} 0 0 ${sweep} ${pt(gapEnd)}`}
          fill="none"
          stroke={c.line}
          strokeWidth={0.45}
          strokeDasharray="1.2 0.9"
        />
      </>
    );
  }

  return (
    <>
      <Path d={runs.join(' ')} fill="none" stroke={c.wall} strokeWidth={WALL} strokeLinecap="butt" />
      {leaf}
    </>
  );
}

/** One bed from above: a frame, a pillow, and a folded blanket line. */
function Bed({ x, y, w, h, filled, color, c }: Rect4 & { filled: boolean; color: string; c: PlanColors }) {
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={w * 0.18}
        fill={filled ? color : c.paper}
        stroke={filled ? color : c.line}
        strokeWidth={0.4}
      />
      <Rect
        x={x + w * 0.16}
        y={y + h * 0.07}
        width={w * 0.68}
        height={h * 0.18}
        rx={w * 0.12}
        fill={filled ? c.paper : 'none'}
        fillOpacity={filled ? 0.85 : 1}
        stroke={filled ? 'none' : c.line}
        strokeWidth={0.3}
      />
      <Line
        x1={x + w * 0.08}
        x2={x + w * 0.92}
        y1={y + h * 0.42}
        y2={y + h * 0.42}
        stroke={filled ? c.paper : c.line}
        strokeOpacity={filled ? 0.7 : 0.6}
        strokeWidth={0.3}
      />
    </G>
  );
}

/** A room's floor, beds, walls and door, in plan units from its top-left. */
function RoomShape({ room, rect, spec, c }: { room: WardRoom; rect: Rect4; spec: WallSpec; c: PlanColors }) {
  const W = rect.w * U;
  const H = rect.h * U;
  const tone = toneOf(room);
  const offline = tone === 'offline';
  // Beds keep clear of the label band at the top and of the door's swing.
  const at = spec.door?.side;
  const swing = spec.door ? spec.door.end - spec.door.start + 1 : 0;
  const label = Math.min(10, H * 0.45);
  const pad = 2.6;
  const top = Math.max(label, at === 'n' ? swing : 0);
  const area = {
    x: pad + (at === 'w' ? swing : 0),
    y: top,
    w: W - 2 * pad - (at === 'w' || at === 'e' ? swing : 0),
    h: H - top - pad - (at === 's' ? swing : 0),
  };
  const beds = offline ? null : bedGrid(room.capacity, area);
  const hatch = `hatch-${room.id}`;

  return (
    <G transform={`translate(${rect.x * U} ${rect.y * U})`}>
      {offline && (
        <Defs>
          <Pattern id={hatch} width={3} height={3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Line x1={0} y1={0} x2={0} y2={3} stroke={c.line} strokeOpacity={0.35} strokeWidth={0.6} />
          </Pattern>
        </Defs>
      )}
      <Rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={c.floor[tone]} />
      {offline && <Rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={`url(#${hatch})`} />}
      {beds?.map((b, n) => (
        <Bed key={n} {...b} filled={n < room.occupied} color={c.bed[tone]} c={c} />
      ))}
      <Walls W={W} H={H} spec={spec} c={c} />
    </G>
  );
}

/** Everything that is not a room, as line-drawn plan symbols. */
function FixtureShape({ fixture, spec, c }: { fixture: WardFixture; spec: WallSpec | undefined; c: PlanColors }) {
  const { kind } = fixture;
  const W = fixture.plan_w * U;
  const H = fixture.plan_h * U;
  const walls = (
    <Walls W={W} H={H} spec={spec ?? soloSpec(fixture.plan_w, fixture.plan_h, FIXTURE_DOOR[kind] ?? null)} c={c} />
  );
  const horizontal = W >= H;
  const line = { stroke: c.line, strokeWidth: 0.5, fill: 'none' } as const;
  const clip = `clip-${fixture.id}`;

  let body: React.ReactNode = null;
  switch (kind) {
    case 'corridor':
      body = (
        <>
          <Rect x={0} y={0} width={W} height={H} fill={c.corridor} />
          {horizontal ? (
            <Line x1={2} x2={W - 2} y1={H / 2} y2={H / 2} {...line} strokeDasharray="3 2" />
          ) : (
            <Line y1={2} y2={H - 2} x1={W / 2} x2={W / 2} {...line} strokeDasharray="3 2" />
          )}
        </>
      );
      break;
    case 'nurse_station': {
      // An L-shaped counter along two sides with a chair behind it.
      const t = Math.min(W, H) * 0.22;
      body = (
        <>
          <Rect x={0} y={0} width={W} height={H} fill={c.corridor} />
          <Path
            d={`M ${W * 0.08} ${H * 0.3} L ${W * 0.08} ${H * 0.92} L ${W * 0.92} ${H * 0.92} L ${W * 0.92} ${H * 0.92 - t} L ${W * 0.08 + t} ${H * 0.92 - t} L ${W * 0.08 + t} ${H * 0.3} Z`}
            fill={c.floor.available}
            stroke={c.wall}
            strokeWidth={0.7}
          />
          <Circle cx={W * 0.62} cy={H * 0.5} r={Math.min(W, H) * 0.1} {...line} />
        </>
      );
      break;
    }
    case 'stairs': {
      const treads = Math.max(3, Math.round((horizontal ? W : H) / 2.2));
      body = (
        <>
          <Rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={c.paper} />
          {Array.from({ length: treads - 1 }, (_, n) => {
            const k = ((n + 1) / treads) * (horizontal ? W : H);
            return horizontal ? (
              <Line key={n} x1={k} x2={k} y1={INSET} y2={H - INSET} {...line} />
            ) : (
              <Line key={n} y1={k} y2={k} x1={INSET} x2={W - INSET} {...line} />
            );
          })}
          {horizontal ? (
            <Path d={`M ${W * 0.12} ${H / 2} L ${W * 0.85} ${H / 2} M ${W * 0.78} ${H * 0.36} L ${W * 0.86} ${H / 2} L ${W * 0.78} ${H * 0.64}`} {...line} strokeWidth={0.7} />
          ) : (
            <Path d={`M ${W / 2} ${H * 0.88} L ${W / 2} ${H * 0.15} M ${W * 0.36} ${H * 0.22} L ${W / 2} ${H * 0.14} L ${W * 0.64} ${H * 0.22}`} {...line} strokeWidth={0.7} />
          )}
          {walls}
        </>
      );
      break;
    }
    case 'elevator':
      body = (
        <>
          <Rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={c.paper} />
          <Path d={`M ${W * 0.2} ${H * 0.2} L ${W * 0.8} ${H * 0.8} M ${W * 0.8} ${H * 0.2} L ${W * 0.2} ${H * 0.8}`} {...line} />
          {walls}
        </>
      );
      break;
    case 'restroom':
    case 'storage':
      body = (
        <>
          <Rect x={INSET} y={INSET} width={W - 2 * INSET} height={H - 2 * INSET} fill={c.corridor} />
          {kind === 'storage' && (
            <>
              <Defs>
                <ClipPath id={clip}>
                  <Rect x={0} y={0} width={W} height={H} />
                </ClipPath>
              </Defs>
              <G clipPath={`url(#${clip})`}>
                {Array.from({ length: Math.ceil((W + H) / 3) }, (_, n) => (
                  <Line key={n} x1={n * 3} y1={0} x2={n * 3 - H} y2={H} {...line} strokeOpacity={0.35} />
                ))}
              </G>
            </>
          )}
          {kind === 'restroom' && (
            <G {...line} strokeWidth={0.55}>
              <Circle cx={W * 0.36} cy={H * 0.55} r={Math.min(W, H) * 0.07} />
              <Path d={`M ${W * 0.36} ${H * 0.62} L ${W * 0.36} ${H * 0.8}`} />
              <Circle cx={W * 0.64} cy={H * 0.55} r={Math.min(W, H) * 0.07} />
              <Path d={`M ${W * 0.56} ${H * 0.82} L ${W * 0.64} ${H * 0.62} L ${W * 0.72} ${H * 0.82} Z`} />
            </G>
          )}
          {walls}
        </>
      );
      break;
    case 'label':
      body = null;
      break;
  }

  return <G transform={`translate(${fixture.plan_x * U} ${fixture.plan_y * U})`}>{body}</G>;
}

interface FloorPlanProps {
  rooms: WardRoom[];
  fixtures: WardFixture[];
  /** The room with the student's patient, outlined. */
  highlightRoomId?: string | null;
  onPressRoom: (room: WardRoom) => void;
}

/** The plan, or nothing when the Dean hasn't placed a single room on it yet. */
export function FloorPlan({ rooms, fixtures, highlightRoomId, onPressRoom }: FloorPlanProps) {
  const { isDark } = useTheme();
  const c = isDark ? PLAN_COLORS.dark : PLAN_COLORS.light;
  const [width, setWidth] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const openedOn = React.useRef<string | null>(null);

  const placed = React.useMemo(
    () =>
      rooms.flatMap((room) => {
        const rect = roomRect(room);
        return rect ? [{ room, rect }] : [];
      }),
    [rooms],
  );

  // Shared walls between rooms and the walled fixtures, as the web works them out.
  const walls = React.useMemo(() => {
    const blocks: WallBlock[] = placed.map(({ room, rect }) => ({ key: `r:${room.id}`, ...rect, door: doorOf(room) }));
    for (const f of fixtures) {
      const block = wallBlockForFixture(`f:${f.id}`, f.kind, { x: f.plan_x, y: f.plan_y, w: f.plan_w, h: f.plan_h });
      if (block) blocks.push(block);
    }
    return planWalls(blocks, { cols: GRID_COLS, rows: GRID_ROWS });
  }, [placed, fixtures]);

  const cell = width > 0 ? Math.max(width / GRID_COLS, MIN_CELL) : 0;
  const sheetW = cell * GRID_COLS;
  const sheetH = cell * GRID_ROWS;
  const scrolls = sheetW > width + 0.5;
  const mine = placed.find(({ room }) => room.id === highlightRoomId) ?? null;

  // Open centred on the student's room, once per room.
  React.useEffect(() => {
    if (!scrolls || !mine || openedOn.current === mine.room.id) return;
    openedOn.current = mine.room.id;
    const centre = (mine.rect.x + mine.rect.w / 2) * cell;
    const x = Math.min(Math.max(centre - width / 2, 0), sheetW - width);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x, animated: false }));
  }, [scrolls, mine, cell, width, sheetW]);

  if (placed.length === 0) return null;

  const box = (r: Rect4) => ({ left: r.x * cell, top: r.y * cell, width: r.w * cell, height: r.h * cell });

  const sheet = (
    <View style={{ width: sheetW, height: sheetH, backgroundColor: c.paper }}>
      <Svg width={sheetW} height={sheetH} viewBox={`0 0 ${GRID_COLS * U} ${GRID_ROWS * U}`}>
        {/* A fine grid every cell and a stronger one every four, like drafting paper. */}
        {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
          <Line key={`v${i}`} x1={i * U} x2={i * U} y1={0} y2={GRID_ROWS * U} stroke={i % 4 === 0 ? c.gridMajor : c.grid} strokeWidth={0.25} />
        ))}
        {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
          <Line key={`h${i}`} y1={i * U} y2={i * U} x1={0} x2={GRID_COLS * U} stroke={i % 4 === 0 ? c.gridMajor : c.grid} strokeWidth={0.25} />
        ))}
        {fixtures.map((f) => (
          <FixtureShape key={f.id} fixture={f} spec={walls.get(`f:${f.id}`)} c={c} />
        ))}
        {placed.map(({ room, rect }) => (
          <RoomShape key={room.id} room={room} rect={rect} spec={walls.get(`r:${room.id}`) ?? soloSpec(rect.w, rect.h, doorOf(room))} c={c} />
        ))}
        {mine && (
          <Rect
            x={mine.rect.x * U - 0.6}
            y={mine.rect.y * U - 0.6}
            width={mine.rect.w * U + 1.2}
            height={mine.rect.h * U + 1.2}
            rx={1.5}
            fill="none"
            stroke={c.mine}
            strokeWidth={1.6}
          />
        )}
      </Svg>

      {/* Text sits over the drawing so it stays crisp. */}
      {fixtures.map((f) => {
        const text = f.label || (f.kind === 'label' ? '' : FIXTURE_LABEL[f.kind]);
        if (!text) return null;
        const centred = f.kind === 'label' || f.kind === 'corridor';
        return (
          <View
            key={f.id}
            pointerEvents="none"
            style={[
              styles.fixtureText,
              centred ? styles.centred : styles.topLeft,
              box({ x: f.plan_x, y: f.plan_y, w: f.plan_w, h: f.plan_h }),
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                f.kind === 'label' ? [styles.planLabel, { color: c.ink }] : [styles.fixtureName, { color: c.muted }],
                f.kind !== 'label' && { backgroundColor: f.kind === 'corridor' ? c.corridor : c.paper },
              ]}
            >
              {text}
            </Text>
          </View>
        );
      })}

      {placed.map(({ room, rect }) => {
        const tone = toneOf(room);
        const isMine = room.id === highlightRoomId;
        return (
          <Pressable
            key={room.id}
            onPress={() => onPressRoom(room)}
            accessibilityRole="button"
            accessibilityLabel={`${room.name}, room ${room.room_number}, ${room.occupied} of ${room.capacity} beds${isMine ? ', your patient' : ''}`}
            style={({ pressed }) => [styles.room, box(rect), pressed && styles.pressed]}
          >
            <View style={styles.roomText}>
              <View style={[styles.tag, { backgroundColor: c.tag, borderLeftColor: isMine ? c.mine : c.bed[tone] }]}>
                <Text numberOfLines={1} style={[styles.roomName, { color: c.ink }]}>
                  {room.name}
                </Text>
                <Text numberOfLines={1} style={[styles.roomNumber, { color: isMine ? c.mine : c.muted }]}>
                  {isMine ? `Rm ${room.room_number} · You` : `Rm ${room.room_number}`}
                </Text>
              </View>
              <Text style={[styles.count, { backgroundColor: c.bed[tone] }]}>
                {tone === 'offline' ? room.status : `${room.occupied}/${room.capacity}`}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      style={[styles.frame, { borderColor: c.gridMajor, backgroundColor: c.paper }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 2)}
    >
      {width === 0 ? null : scrolls ? (
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
          {sheet}
        </ScrollView>
      ) : (
        sheet
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  room: { position: 'absolute' },
  pressed: { opacity: 0.6 },
  roomText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  tag: {
    flexShrink: 1,
    minWidth: 0,
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingVertical: 1,
    paddingLeft: 4,
    paddingRight: 5,
  },
  roomName: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  roomNumber: { fontSize: 8.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  count: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    fontSize: 8.5,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  fixtureText: { position: 'absolute', overflow: 'hidden' },
  centred: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  topLeft: { alignItems: 'flex-start', justifyContent: 'flex-start', paddingHorizontal: 5, paddingVertical: 5 },
  fixtureName: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    borderRadius: 2,
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  planLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 2.2, textTransform: 'uppercase' },
});
