import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

/** A circular score, filled clockwise from the top, with the percentage inside. */
export function ScoreRing({
  score,
  size = 56,
  stroke = 6,
  color,
  label,
}: {
  score: number;
  size?: number;
  stroke?: number;
  color: string;
  /** A second line under the number, for the larger rings. */
  label?: string;
}) {
  const { Palette } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Palette.borderLight} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (clamped / 100) * circ}
          fill="none"
        />
      </Svg>
      <Text style={{ fontSize: size * 0.26, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] }}>
        {clamped}%
      </Text>
      {label ? <Text style={{ fontSize: size * 0.11, fontWeight: '700', color: Palette.textMuted }}>{label}</Text> : null}
    </View>
  );
}
