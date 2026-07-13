import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Palette, Radius } from '@/constants/theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: ViewStyle;
}

const sizeStyles = {
  sm: { paddingVertical: 9, paddingHorizontal: 16, fontSize: 14 },
  md: { paddingVertical: 13, paddingHorizontal: 24, fontSize: 15 },
  lg: { paddingVertical: 16, paddingHorizontal: 32, fontSize: 17 },
} as const;

export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
}: PrimaryButtonProps) {
  const backgroundColor = disabled
    ? Palette.border
    : variant === 'primary'
      ? Palette.primary
      : variant === 'danger'
        ? '#DC2626'
        : variant === 'secondary'
          ? Palette.surfaceMuted
          : 'transparent';

  const textColor = disabled
    ? Palette.textMuted
    : variant === 'primary' || variant === 'danger'
      ? '#fff'
      : variant === 'outline'
        ? Palette.primary
        : Palette.ink;

  const { fontSize, ...padding } = sizeStyles[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        padding,
        {
          backgroundColor,
          borderColor: variant === 'outline' ? Palette.primary : 'transparent',
          borderWidth: variant === 'outline' ? 1.5 : 0,
        },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
