import React, { useEffect } from "react";
import { View, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

import logoImg from "@/assets/images/logo-pill.png";

/** Same teal ramp as the login screen's hero — keeps the boot screen and the
 * first thing a user lands on visually continuous. */
const Teal = {
  deepest: "#082E38",
  deep: "#0D4550",
  primary: "#1B6B7B",
  light: "#35859B",
};

// Width of one "beat" of the trace; the pattern is drawn twice back to back
// and scrolled exactly one segment-width per loop, so the seam is invisible.
const SEGMENT_W = 220;
const TRACE_H = 64;
const MID_Y = TRACE_H / 2;

/** One ECG beat: long flatline, sharp spike, quick settle, flatline out. */
function beatPath(offsetX: number) {
  const x = (f: number) => offsetX + SEGMENT_W * f;
  return [
    `M${x(0)} ${MID_Y}`,
    `L${x(0.34)} ${MID_Y}`,
    `L${x(0.4)} ${MID_Y - 8}`,
    `L${x(0.45)} ${MID_Y + 24}`,
    `L${x(0.5)} ${MID_Y - 34}`,
    `L${x(0.56)} ${MID_Y + 12}`,
    `L${x(0.62)} ${MID_Y}`,
    `L${x(1)} ${MID_Y}`,
  ].join(" ");
}

/** An endlessly left-scrolling ECG trace, like a bedside monitor sweep. */
function PulseTrace() {
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(-SEGMENT_W, { duration: 1400, easing: Easing.linear }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [translateX]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.traceClip}>
      <Animated.View style={style}>
        <Svg width={SEGMENT_W * 2} height={TRACE_H}>
          <Path
            d={beatPath(0)}
            stroke="#FFFFFF"
            strokeOpacity={0.85}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={beatPath(SEGMENT_W)}
            stroke="#FFFFFF"
            strokeOpacity={0.85}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Full-bleed boot screen shown while the session is being restored.
 * Replaces a plain spinner with a bedside-monitor motif — a static logo
 * above a continuously scrolling ECG trace, in the login screen's teal. */
export function BootLoader() {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <Image source={logoImg} style={styles.logo} resizeMode="contain" />
        </View>

        <PulseTrace />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  logoWrap: {
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logo: {
    width: 108,
    height: 108,
  },
  traceClip: {
    width: SEGMENT_W,
    height: TRACE_H,
    overflow: "hidden",
    marginTop: 20,
    opacity: 0.9,
  },
});
