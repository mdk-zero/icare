import { useMemo } from 'react';
import { Palettes, Accents, Shadows, getType, Radius, Spacing, ColorScheme } from '@/constants/theme';
import { useColorScheme } from './use-color-scheme';
import { useThemePreference } from './useThemePreference';

/**
 * Live, scheme-aware design tokens. Follows the device light/dark setting by
 * default (react-native's useColorScheme subscribes to Appearance changes),
 * but an explicit Light/Dark choice in Settings overrides it.
 */
export function useTheme() {
  const system: ColorScheme = useColorScheme() ?? 'light';
  const { preference } = useThemePreference();
  const scheme: ColorScheme = preference === 'system' ? system : preference;

  return useMemo(() => {
    const Palette = Palettes[scheme];
    const Accent = Accents[scheme];
    const Shadow = Shadows[scheme];
    const Type = getType(Palette);
    return { scheme, isDark: scheme === 'dark', Palette, Accent, Shadow, Type, Radius, Spacing };
  }, [scheme]);
}

export type AppTheme = ReturnType<typeof useTheme>;
