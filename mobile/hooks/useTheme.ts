import { useMemo } from 'react';
import { Palettes, Accents, Shadows, getType, Radius, Spacing, ColorScheme } from '@/constants/theme';
import { useColorScheme } from './use-color-scheme';

/**
 * Live, scheme-aware design tokens. Re-renders automatically when the user
 * flips their device between light and dark mode (react-native's
 * useColorScheme subscribes to Appearance changes under the hood).
 */
export function useTheme() {
  const scheme: ColorScheme = useColorScheme() ?? 'light';

  return useMemo(() => {
    const Palette = Palettes[scheme];
    const Accent = Accents[scheme];
    const Shadow = Shadows[scheme];
    const Type = getType(Palette);
    return { scheme, isDark: scheme === 'dark', Palette, Accent, Shadow, Type, Radius, Spacing };
  }, [scheme]);
}

export type AppTheme = ReturnType<typeof useTheme>;
