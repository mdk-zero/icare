import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

interface IconContainerProps {
  icon: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'primary';
}

export function IconContainer({ icon, size = 'md', variant = 'default' }: IconContainerProps) {
  const getSize = () => {
    switch (size) {
      case 'sm':
        return 32;
      case 'md':
        return 40;
      case 'lg':
        return 48;
      default:
        return 40;
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 14;
      case 'md':
        return 18;
      case 'lg':
        return 22;
      default:
        return 18;
    }
  };

  const dimension = getSize();
  const bgColor = variant === 'primary' ? `${Colors.light.primary}15` : '#f3f4f6';
  const iconColor = variant === 'primary' ? Colors.light.primary : Colors.light.icon;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension * 0.3,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text style={[styles.icon, { fontSize: getIconSize() }]}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    textAlign: 'center',
  },
});