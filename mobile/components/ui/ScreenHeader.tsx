import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Radius, Spacing, Type } from '@/constants/theme';

interface ScreenHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: keyof typeof Accent;
  right?: React.ReactNode;
}

/**
 * Lightweight page header rendered directly on the canvas (no card),
 * so screens lead with content instead of stacked white boxes.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  accent = 'teal',
  right,
}: ScreenHeaderProps) {
  const colors = Accent[accent];
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (icon ? (
          <View style={[styles.iconTile, { backgroundColor: colors.bg }]}>
            <Ionicons name={icon} size={22} color={colors.fg} />
          </View>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  textColumn: {
    flex: 1,
    marginRight: Spacing.md,
  },
  eyebrow: {
    ...Type.eyebrow,
    marginBottom: Spacing.xs,
  },
  title: Type.screenTitle,
  subtitle: {
    ...Type.caption,
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: Radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
