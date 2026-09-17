import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Radius } from '@/constants/theme';
import { roomStatus, RoomTone } from '@/lib/rooms';
import type { WardRoom } from '@/lib/api';

/**
 * Read-only ward floor plan, the phone's view of the layout an admin drew on
 * the web (migration 035 stores the placement on the rooms table).
 *
 * The geometry must not drift from web/app/components/FloorPlan.tsx: a fixed
 * 24 x 16 grid, each room a rectangle positioned as a percentage of it. The
 * canvas keeps that aspect ratio and scales to the screen width, so a default
 * 4 x 3 room lands around 65 x 49pt on a phone — comfortably tappable without
 * pan or zoom.
 */

export const GRID_COLS = 24;
export const GRID_ROWS = 16;

/** The stored placement, or null when the room is not on the plan. */
export function roomRect(room: WardRoom) {
  if (room.plan_x == null || room.plan_y == null || room.plan_w == null || room.plan_h == null) {
    return null;
  }
  return { x: room.plan_x, y: room.plan_y, w: room.plan_w, h: room.plan_h };
}

/** True when at least one room has been placed — otherwise there is no plan. */
export function hasPlacedRooms(rooms: WardRoom[]): boolean {
  return rooms.some((room) => roomRect(room) !== null);
}

interface FloorPlanCanvasProps {
  rooms: WardRoom[];
  /** Room to ring as the student's own. */
  highlightRoomId?: string | null;
  onPressRoom: (room: WardRoom) => void;
}

export function FloorPlanCanvas({ rooms, highlightRoomId, onPressRoom }: FloorPlanCanvasProps) {
  const { Palette, Accent } = useTheme();

  const toneAccent: Record<RoomTone, { fg: string; bg: string; border: string }> = {
    available: Accent.green,
    crowded: Accent.amber,
    full: Accent.red,
  };

  const placed = rooms
    .map((room) => ({ room, rect: roomRect(room) }))
    .filter((entry): entry is { room: WardRoom; rect: NonNullable<ReturnType<typeof roomRect>> } =>
      entry.rect !== null,
    );

  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: Palette.surfaceMuted, borderColor: Palette.border },
      ]}
    >
      {placed.map(({ room, rect }) => {
        const offline = room.status !== 'active';
        const accent = toneAccent[roomStatus(room.occupied, room.capacity)];
        const isMine = room.id === highlightRoomId;
        return (
          <Pressable
            key={room.id}
            onPress={() => onPressRoom(room)}
            accessibilityRole="button"
            accessibilityLabel={`${room.name}, room ${room.room_number}, ${room.occupied} of ${room.capacity} beds occupied${isMine ? ', your patient is here' : ''}`}
            style={({ pressed }) => [
              styles.block,
              {
                left: `${(rect.x / GRID_COLS) * 100}%`,
                top: `${(rect.y / GRID_ROWS) * 100}%`,
                width: `${(rect.w / GRID_COLS) * 100}%`,
                height: `${(rect.h / GRID_ROWS) * 100}%`,
                backgroundColor: offline ? Palette.borderLight : accent.bg,
                borderColor: isMine ? Palette.primary : offline ? Palette.border : accent.border,
                borderWidth: isMine ? 2 : 1,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.blockTop}>
              <Text
                numberOfLines={1}
                style={[styles.blockName, { color: offline ? Palette.textMuted : accent.fg }]}
              >
                {room.name}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.blockNumber, { color: offline ? Palette.textFaint : accent.fg }]}
              >
                Room {room.room_number}
              </Text>
            </View>
            <View style={styles.blockBottom}>
              {offline ? (
                <Ionicons name="construct" size={11} color={Palette.textMuted} />
              ) : (
                <Text style={[styles.blockCount, { color: accent.fg }]}>
                  {room.occupied}/{room.capacity}
                </Text>
              )}
              {isMine ? <View style={[styles.mineDot, { backgroundColor: Palette.primary }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    aspectRatio: GRID_COLS / GRID_ROWS,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    borderRadius: Radius.sm,
    padding: 4,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  blockTop: {
    minWidth: 0,
  },
  blockName: {
    fontSize: 10,
    fontWeight: '700',
  },
  blockNumber: {
    fontSize: 9,
    opacity: 0.75,
  },
  blockBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  blockCount: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  mineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
