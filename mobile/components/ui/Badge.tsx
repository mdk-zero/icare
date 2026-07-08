import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Accent } from '@/constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

const variantAccent = {
  default: Accent.slate,
  success: Accent.green,
  warning: Accent.amber,
  danger: Accent.red,
  info: Accent.blue,
} as const;

export function Badge({ label, variant = 'default', size = 'md' }: BadgeProps) {
  const accent = variantAccent[variant];
  const fontSize = size === 'sm' ? 10 : 11;

  return (
    <View style={[styles.badge, { backgroundColor: accent.bg }]}>
      <Text style={[styles.text, { color: accent.fg, fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
