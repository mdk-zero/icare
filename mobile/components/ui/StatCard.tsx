import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

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
  color = Colors.light.primary,
}: StatCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up': return '#16a34a';
      case 'down': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      default: return 'remove';
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
        <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
          <Ionicons name={(icon as any) || 'bar-chart'} size={20} color={color} />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    backgroundColor: '#f3f4f6',
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    color: '#11181c',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
});