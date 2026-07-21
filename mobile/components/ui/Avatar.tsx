import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  imageUrl?: string;
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getSize = () => {
    switch (size) {
      case 'sm':
        return 32;
      case 'md':
        return 40;
      case 'lg':
        return 64;
      default:
        return 40;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return 12;
      case 'md':
        return 14;
      case 'lg':
        return 24;
      default:
        return 14;
    }
  };

  const dimension = getSize();
  const { Palette } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette), [Palette]);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: getFontSize() }]}>{getInitials(name)}</Text>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    avatar: {
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      color: '#fff',
      fontWeight: '600',
    },
  });
}