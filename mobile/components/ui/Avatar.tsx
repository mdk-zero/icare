import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** Already-resolved URL — pass `resolveAvatarUrl()` output, not a bucket path. */
  imageUrl?: string | null;
}

export function Avatar({ name, size = 'md', imageUrl }: AvatarProps) {
  /** First letter of the first name plus the last, matching the web avatar. */
  const getInitials = (value: string) => {
    const words = value.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (words.length === 0) return '?';
    const letterOf = (w: string) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
    const last = words.length > 1 ? letterOf(words[words.length - 1]) : '';
    return (letterOf(words[0]) + last).toUpperCase() || '?';
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

  const box = { width: dimension, height: dimension, borderRadius: dimension / 2 };

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={box} contentFit="cover" />;
  }

  return (
    <View style={[styles.avatar, box]}>
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