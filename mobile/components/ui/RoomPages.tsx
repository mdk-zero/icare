import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing } from '@/constants/theme';
import { roomStatus, ROOM_TONE_LABEL, RoomTone } from '@/lib/rooms';
import type { WardRoom } from '@/lib/api';

/**
 * The ward's rooms as swipeable pages of four cards (two by two), so every
 * card has room for its number, bed count and full name. There's no page
 * counter: the edge of the next page peeks in instead, which says "more this
 * way" without adding chrome. The pager opens on the page holding the
 * student's own room.
 */

/** Cards per page, laid out two by two. */
const PER_PAGE = 4;
/** How much of the next page shows at the right edge. */
const PEEK = 28;
/** Space between pages, and between cards on a page. */
const GAP = Spacing.md;
const CARD_HEIGHT = 112;

interface RoomPagesProps {
  rooms: WardRoom[];
  /** Room to mark as the student's own. */
  highlightRoomId?: string | null;
  onPressRoom: (room: WardRoom) => void;
}

/** 101, 102 … 110 in number order, not 101, 110, 102. */
function byRoomNumber(a: WardRoom, b: WardRoom) {
  return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
}

export function RoomPages({ rooms, highlightRoomId, onPressRoom }: RoomPagesProps) {
  const { Palette, Accent } = useTheme();
  const [width, setWidth] = React.useState(0);
  const scrollRef = React.useRef<ScrollView>(null);
  const openedOn = React.useRef<string | null>(null);

  const sorted = [...rooms].sort(byRoomNumber);
  const pages: WardRoom[][] = [];
  for (let i = 0; i < sorted.length; i += PER_PAGE) pages.push(sorted.slice(i, i + PER_PAGE));

  const paged = pages.length > 1;
  const pageWidth = paged ? width - PEEK : width;
  const cardWidth = (pageWidth - GAP) / 2;
  const mineIndex = sorted.findIndex((room) => room.id === highlightRoomId);
  const minePage = mineIndex >= 0 ? Math.floor(mineIndex / PER_PAGE) : 0;

  const toneAccent: Record<RoomTone, { fg: string; bg: string; border: string }> = {
    available: Accent.green,
    crowded: Accent.amber,
    full: Accent.red,
  };

  // Open on the page with the student's room, once per room.
  React.useEffect(() => {
    if (!paged || width === 0 || !highlightRoomId || openedOn.current === highlightRoomId) return;
    openedOn.current = highlightRoomId;
    if (minePage === 0) return;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ x: minePage * (pageWidth + GAP), animated: false }),
    );
  }, [paged, width, highlightRoomId, minePage, pageWidth]);

  const card = (room: WardRoom) => {
    const offline = room.status !== 'active';
    const tone = roomStatus(room.occupied, room.capacity);
    const accent = toneAccent[tone];
    const isMine = room.id === highlightRoomId;
    const fill = room.capacity > 0 ? Math.min(room.occupied / room.capacity, 1) : 1;
    const ink = isMine ? Palette.white : offline ? Palette.textMuted : Palette.ink;
    const subInk = isMine ? 'rgba(255,255,255,0.85)' : offline ? Palette.textMuted : Palette.textSecondary;

    return (
      <Pressable
        key={room.id}
        onPress={() => onPressRoom(room)}
        accessibilityRole="button"
        accessibilityLabel={`${room.name}, room ${room.room_number}, ${
          offline ? room.status : `${room.occupied} of ${room.capacity} beds occupied, ${ROOM_TONE_LABEL[tone]}`
        }${isMine ? ', your patient is here' : ''}`}
        style={({ pressed }) => [
          styles.card,
          {
            width: cardWidth,
            backgroundColor: isMine ? Palette.primary : Palette.surface,
            borderColor: isMine ? Palette.primary : offline ? Palette.textFaint : Palette.border,
            borderStyle: offline ? 'dashed' : 'solid',
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.head}>
          <Text style={[styles.number, { color: ink }]} numberOfLines={1}>
            {room.room_number}
          </Text>
          {offline ? (
            <Ionicons name="construct" size={13} color={Palette.textMuted} />
          ) : (
            <View style={styles.bedsRow}>
              <View style={[styles.toneDot, { backgroundColor: isMine ? Palette.white : accent.fg }]} />
              <Text style={[styles.beds, { color: subInk }]}>
                {room.occupied}/{room.capacity}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.name, { color: subInk }]} numberOfLines={2}>
          {room.name}
        </Text>

        {offline ? (
          <Text style={[styles.closedText, { color: Palette.textMuted }]}>
            {room.status === 'maintenance' ? 'Under maintenance' : 'Closed'}
          </Text>
        ) : (
          // Bed meter: how full the room is, in its occupancy colour.
          <View
            style={[styles.meterTrack, { backgroundColor: isMine ? 'rgba(255,255,255,0.28)' : Palette.borderLight }]}
          >
            <View
              style={[
                styles.meterFill,
                { width: `${fill * 100}%`, backgroundColor: isMine ? Palette.white : accent.fg },
              ]}
            />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={paged}
          showsHorizontalScrollIndicator={false}
          snapToInterval={pageWidth + GAP}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          // Lets the last page line up at the left edge like the others.
          contentContainerStyle={paged ? { paddingRight: PEEK } : undefined}
        >
          {pages.map((page, index) => (
            <View
              key={page[0].id}
              style={[styles.page, { width: pageWidth, marginRight: index < pages.length - 1 ? GAP : 0 }]}
            >
              {page.map(card)}
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.legend}>
        <LegendItem color={Accent.green.fg} label={ROOM_TONE_LABEL.available} />
        <LegendItem color={Accent.amber.fg} label={ROOM_TONE_LABEL.crowded} />
        <LegendItem color={Accent.red.fg} label={ROOM_TONE_LABEL.full} />
        {sorted.some((room) => room.status !== 'active') ? (
          <LegendItem color={Palette.textFaint} label="Closed" box="dashed" />
        ) : null}
        {mineIndex >= 0 ? <LegendItem color={Palette.primary} label="Your patient" box="filled" /> : null}
      </View>
      {paged ? (
        <View style={styles.hint}>
          <Ionicons name="swap-horizontal" size={12} color={Palette.textMuted} />
          <Text style={[styles.hintText, { color: Palette.textMuted }]}>Swipe for more rooms</Text>
        </View>
      ) : null}
    </View>
  );
}

function LegendItem({ color, label, box }: { color: string; label: string; box?: 'dashed' | 'filled' }) {
  const { Palette } = useTheme();
  return (
    <View style={styles.legendItem}>
      {box ? (
        <View
          style={[
            styles.legendBox,
            {
              borderColor: color,
              borderStyle: box === 'dashed' ? 'dashed' : 'solid',
              backgroundColor: box === 'filled' ? color : 'transparent',
            },
          ]}
        />
      ) : (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      )}
      <Text style={[styles.legendText, { color: Palette.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: GAP,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  number: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  bedsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  toneDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  beds: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: Spacing.xs,
  },
  meterTrack: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },
  closedText: {
    position: 'absolute',
    left: Spacing.md,
    bottom: Spacing.sm + 2,
    fontSize: 11,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
    marginTop: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendBox: {
    width: 11,
    height: 9,
    borderRadius: 2,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.xs + 2,
  },
  hintText: {
    fontSize: 11,
  },
});
