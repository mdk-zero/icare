import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, Spacing, Type } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, count, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {count != null && (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          )}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={13} color={Palette.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: Type.sectionTitle,
  countPill: {
    backgroundColor: Palette.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    marginLeft: Spacing.sm,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.textSecondary,
  },
  subtitle: {
    ...Type.micro,
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Palette.primaryTint,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.primary,
  },
});
