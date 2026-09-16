import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { isOnline, subscribeConnectivity } from '@/lib/client';

/** How long the "Back online" confirmation stays up before sliding away. */
const RESTORED_VISIBLE_MS = 2200;

type Status = 'hidden' | 'offline' | 'restored';

/**
 * App-wide connection toast, in the shape Messenger uses: a small pill that
 * drops in under the status bar while the network is down and slides away a
 * couple of seconds after it returns.
 *
 * Mounted once at the root so it floats over every screen, including the boot
 * loader and login. It is purely informational — `pointerEvents="none"` keeps
 * it from stealing a tap from whatever is underneath it, which also keeps it
 * out of the iOS accessibility tree, so the label is announced explicitly.
 */
export function ConnectionToast() {
  const { Accent, Shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(Shadow), [Shadow]);

  const [status, setStatus] = React.useState<Status>(() => (isOnline() ? 'hidden' : 'offline'));

  React.useEffect(
    () =>
      subscribeConnectivity((online) => {
        setStatus((current) => {
          if (!online) return 'offline';
          // Only confirm a recovery from a drop the student was actually told
          // about; a successful request while already hidden says nothing new.
          return current === 'offline' ? 'restored' : 'hidden';
        });
      }),
    [],
  );

  React.useEffect(() => {
    if (status !== 'restored') return;
    const timer = setTimeout(() => setStatus('hidden'), RESTORED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Travel far enough to clear the status bar, so the pill is genuinely
  // off-screen while hidden rather than a ghost sitting over the header.
  const travel = insets.top + 56;
  const progress = useSharedValue(status === 'hidden' ? 0 : 1);

  React.useEffect(() => {
    const shown = status !== 'hidden';
    progress.value = withTiming(shown ? 1 : 0, {
      duration: shown ? 260 : 180,
      easing: shown ? Easing.out(Easing.back(1.2)) : Easing.in(Easing.quad),
    });
  }, [status, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    // The entrance easing overshoots 1 to land the pill with a slight bounce;
    // only the translation should follow it past the end point.
    opacity: Math.min(progress.value, 1),
    transform: [{ translateY: -travel * (1 - progress.value) }],
  }));

  const offline = status !== 'restored';
  const tone = offline ? Accent.slate : Accent.green;
  const label = offline ? 'Offline' : 'Back online';

  React.useEffect(() => {
    if (status !== 'hidden') AccessibilityInfo.announceForAccessibility(label);
  }, [status, label]);

  return (
    <View style={[styles.layer, { top: insets.top + Spacing.sm }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.pill,
          { backgroundColor: tone.bg, borderColor: tone.border },
          animatedStyle,
        ]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Ionicons
          name={offline ? 'cloud-offline' : 'checkmark-circle'}
          size={14}
          color={tone.fg}
        />
        <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
      </Animated.View>
    </View>
  );
}

function createStyles(Shadow: ReturnType<typeof useTheme>['Shadow']) {
  return StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 100,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: Radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: Spacing.md + 2,
      paddingVertical: Spacing.sm - 1,
      // The pill floats over arbitrary screen content — a card, the canvas,
      // a photo — so it carries its own elevation to stay readable.
      ...Shadow.raised,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
  });
}

export default ConnectionToast;
