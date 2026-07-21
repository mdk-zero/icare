import React, { useEffect, useRef, useState } from "react";
import { View, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";

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

/** One ECG beat as (x fraction, y offset from midline) breakpoints: long
 * flatline, sharp spike, quick settle, flatline out. Shared by the path
 * drawer and the leading-dot's position lookup, so they can never drift
 * out of sync with each other. */
const BEAT_POINTS: [frac: number, dy: number][] = [
  [0, 0],
  [0.34, 0],
  [0.4, -8],
  [0.45, 24],
  [0.5, -34],
  [0.56, 12],
  [0.62, 0],
  [1, 0],
];

function beatPath(offsetX: number) {
  return BEAT_POINTS.map(
    ([f, dy], i) => `${i === 0 ? "M" : "L"}${offsetX + SEGMENT_W * f} ${MID_Y + dy}`,
  ).join(" ");
}

/** Height of the beat curve at a given fraction (0–1) across one segment. */
function beatY(localFrac: number) {
  const frac = Math.min(Math.max(localFrac, 0), 1);
  for (let i = 1; i < BEAT_POINTS.length; i++) {
    const [f0, dy0] = BEAT_POINTS[i - 1];
    const [f1, dy1] = BEAT_POINTS[i];
    if (frac <= f1) {
      const t = f1 === f0 ? 0 : (frac - f0) / (f1 - f0);
      return MID_Y + dy0 + (dy1 - dy0) * t;
    }
  }
  return MID_Y;
}

/** Y position of the curve at a fixed screen x, given the current scroll
 * offset — whichever of the two drawn beats currently covers that x wins. */
function yAtScreenX(screenX: number, offset: number) {
  for (const start of [offset, offset + SEGMENT_W]) {
    const local = (screenX - start) / SEGMENT_W;
    if (local >= 0 && local <= 1) return beatY(local);
  }
  return MID_Y;
}

const CYCLE_MS = 1400;
// Inset from the clip's right edge so the leading dot isn't half-clipped.
const DOT_X = SEGMENT_W - 6;

/** An endlessly left-scrolling ECG trace, like a bedside monitor sweep.
 * Driven by a plain requestAnimationFrame loop that recomputes the path's
 * `d` string every frame — no native-driver/worklet transform involved, so
 * it can't fall victim to a transform failing to reach the SVG's native
 * view (the failure mode that broke both a wrapping Animated.View and an
 * animated inner <G>). */
function PulseTrace() {
  const [offset, setOffset] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let frame: number;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) % CYCLE_MS;
      setOffset(-(elapsed / CYCLE_MS) * SEGMENT_W);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const dotY = yAtScreenX(DOT_X, offset);

  return (
    <View style={styles.traceClip}>
      <Svg width={SEGMENT_W * 2} height={TRACE_H}>
        <Path
          d={beatPath(offset)}
          stroke="#FFFFFF"
          strokeOpacity={0.85}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={beatPath(offset + SEGMENT_W)}
          stroke="#FFFFFF"
          strokeOpacity={0.85}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Static fade painted over the sweep — trailing edge (left) dissolves
       * into the background, leading edge (right) stays fully visible. */}
      <LinearGradient
        colors={["#0D4550", "#0D4550", "rgba(13, 69, 80, 0)"]}
        locations={[0, 0.08, 0.6]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Leading dot — rides the tip of the wave at the point it enters view. */}
      <Svg width={SEGMENT_W} height={TRACE_H} style={StyleSheet.absoluteFill}>
        <Circle cx={DOT_X} cy={dotY} r={7} fill="#FFFFFF" opacity={0.25} />
        <Circle cx={DOT_X} cy={dotY} r={3} fill="#FFFFFF" />
      </Svg>
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
