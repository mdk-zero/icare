import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export function Badge({ label, variant = 'default', size = 'md' }: BadgeProps) {
  const getVariantStyle = () => {
    switch (variant) {
      case 'success':
        return { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' };
      case 'warning':
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
      case 'danger':
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
      case 'info':
        return { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
    }
  };

  const variantStyle = getVariantStyle();
  const fontSize = size === 'sm' ? 10 : 12;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: variantStyle.bg, borderColor: variantStyle.border },
      ]}
    >
      <Text style={[styles.text, { color: variantStyle.text, fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});