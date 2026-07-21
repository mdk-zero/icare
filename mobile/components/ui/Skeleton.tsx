import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** A single shimmering placeholder block — the atom every skeleton layout is built from. */
export function SkeletonBlock({ width = '100%', height = 14, radius = Radius.sm, style }: SkeletonBlockProps) {
  const { Palette } = useTheme();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: Palette.borderLight }, animatedStyle, style]}
    />
  );
}

/** Skeleton for a ScreenHeader: eyebrow, title, subtitle + icon tile. */
export function SkeletonHeader() {
  const { Palette, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1, marginRight: Spacing.md }}>
        <SkeletonBlock width={90} height={11} radius={4} style={{ marginBottom: Spacing.sm }} />
        <SkeletonBlock width="65%" height={22} radius={6} style={{ marginBottom: Spacing.xs }} />
        <SkeletonBlock width="45%" height={13} radius={4} />
      </View>
      <SkeletonBlock width={46} height={46} radius={Radius.md + 2} />
    </View>
  );
}

/** Generic card skeleton: icon + two text lines, optional footer row — matches the
 * bordered white-surface card shape used across vitals/tasks/ehr lists. */
export function SkeletonCard({ footer = true }: { footer?: boolean }) {
  const { Palette, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <SkeletonBlock width={44} height={44} radius={22} />
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <SkeletonBlock width="70%" height={15} radius={4} style={{ marginBottom: 8 }} />
          <SkeletonBlock width="40%" height={11} radius={4} />
        </View>
        <SkeletonBlock width={54} height={20} radius={Radius.pill} />
      </View>
      {footer && (
        <View style={styles.cardFooterRow}>
          <SkeletonBlock width={70} height={20} radius={Radius.pill} />
          <SkeletonBlock width={90} height={11} radius={4} />
        </View>
      )}
    </View>
  );
}

/** A vertical stack of card skeletons — the default "screen still loading" body. */
export function SkeletonList({ count = 3, footer = true }: { count?: number; footer?: boolean }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} footer={footer} />
      ))}
    </View>
  );
}

/** Full-screen skeleton: header + a list of card placeholders, for screens that
 * render nothing but a spinner while their first fetch resolves. */
export function SkeletonScreen({ cards = 3, topOffset }: { cards?: number; topOffset?: number }) {
  return (
    <View style={[staticStyles.screen, topOffset !== undefined && { paddingTop: topOffset }]}>
      <SkeletonHeader />
      <SkeletonList count={cards} />
    </View>
  );
}

const staticStyles = StyleSheet.create({
  screen: {
    padding: Spacing.lg,
  },
});

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Shadow: ReturnType<typeof useTheme>['Shadow']) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: Spacing.md,
      paddingTop: Spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
  });
}
