import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  onPress?: () => void;
  color?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  onPress,
  color,
}: StatCardProps) {
  const { Palette, Accent, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const resolvedColor = color ?? Palette.primary;

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return Accent.green.fg;
      case 'down': return Accent.red.fg;
      default: return Palette.textMuted;
    }
  };

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${resolvedColor}15` }]}>
          <Ionicons name={(icon as any) || 'bar-chart'} size={20} color={resolvedColor} />
        </View>
        {trend && trendValue && (
          <View style={styles.trend}>
            <Text style={[styles.trendText, { color: getTrendColor() }]}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Container>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Shadow: ReturnType<typeof useTheme>['Shadow']) {
  return StyleSheet.create({
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trend: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: Palette.surfaceMuted,
    },
    trendText: {
      fontSize: 12,
      fontWeight: '600',
    },
    value: {
      fontSize: 28,
      fontWeight: '700',
      color: Palette.ink,
      marginBottom: 4,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: Palette.text,
    },
    subtitle: {
      fontSize: 12,
      color: Palette.textMuted,
      marginTop: 4,
    },
  });
}