import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, Spacing } from '@/constants/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  tone?: 'muted' | 'success';
}

export function EmptyState({ icon = 'file-tray-outline', message, tone = 'muted' }: EmptyStateProps) {
  const color = tone === 'success' ? '#16A34A' : Palette.textFaint;
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={color} />
      <Text style={[styles.text, tone === 'success' && styles.textSuccess]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  text: {
    fontSize: 14,
    color: Palette.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  textSuccess: {
    color: '#16A34A',
    fontWeight: '600',
  },
});
