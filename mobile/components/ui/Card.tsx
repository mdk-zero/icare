import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'bordered';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { Palette, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  return (
    <View style={[styles.card, variant === 'elevated' && styles.elevated, style]}>
      {children}
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Shadow: ReturnType<typeof useTheme>['Shadow']) {
  return StyleSheet.create({
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    elevated: Shadow.raised,
  });
}
