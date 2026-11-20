import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { clockLabel, secondsLeft, timeLimitLabel } from '@/lib/time-limit';

/**
 * The clock of a started patient case or Return Demonstration. With a time
 * limit (098) it counts down, turns amber in the last fifth and red once it
 * runs out, then counts the time over. Without one it counts up, as before.
 */
export function CountdownCard({
  elapsed,
  timeLimitMinutes,
  style,
}: {
  /** Seconds since Start; the card is hidden while null. */
  elapsed: number | null;
  timeLimitMinutes?: number | null;
  style?: ViewStyle;
}) {
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette), [Palette]);
  if (elapsed === null) return null;

  const left = secondsLeft(timeLimitMinutes, elapsed);
  if (left === null) {
    return (
      <Card style={{ ...styles.card, ...style }}>
        <Ionicons name="timer-outline" size={20} color={Palette.primary} />
        <View style={styles.text}>
          <Text style={styles.clock}>{clockLabel(elapsed)}</Text>
          <Text style={styles.body}>Running until your instructor grades the last task.</Text>
        </View>
      </Card>
    );
  }

  const total = (timeLimitMinutes ?? 0) * 60;
  const over = left < 0;
  const low = !over && left <= total * 0.2;
  const tone = over ? Accent.red : low ? Accent.amber : null;
  const color = tone?.fg ?? Palette.primary;
  const share = Math.max(0, Math.min(1, left / total));

  return (
    <Card style={{ ...styles.card, ...(tone ? { backgroundColor: tone.bg, borderColor: tone.border } : {}), ...style }}>
      <Ionicons name={over ? 'alarm-outline' : 'timer-outline'} size={20} color={color} />
      <View
        style={styles.text}
        accessible
        accessibilityLabel={
          over ? `Time is up. ${clockLabel(-left)} over.` : `${clockLabel(left)} left of ${timeLimitLabel(timeLimitMinutes!)}`
        }
      >
        <View style={styles.row}>
          <Text style={[styles.clock, { color }]}>{over ? `+${clockLabel(-left)}` : clockLabel(left)}</Text>
          <Text style={[styles.unit, { color }]}>{over ? 'over time' : 'left'}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.body}>
          {over
            ? 'Time is up. Keep going and finish; it still counts, just for less.'
            : `You have ${timeLimitLabel(timeLimitMinutes!)}. The clock stops when your instructor grades the last task.`}
        </Text>
      </View>
    </Card>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.lg },
    text: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    clock: { fontSize: 22, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] },
    unit: { fontSize: 13, fontWeight: '600' },
    track: {
      height: 6,
      borderRadius: Radius.pill,
      backgroundColor: Palette.borderLight,
      overflow: 'hidden',
      marginTop: 6,
      marginBottom: 8,
    },
    fill: { height: 6, borderRadius: Radius.pill },
    body: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
  });
}
