import { Platform } from 'react-native';

const tintColorLight = '#1B6B7B';
const tintColorDark = '#35859B';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    primary: '#1B6B7B',
    primaryDark: '#145a63',
    primaryDarker: '#155663',
    cardBackground: '#ffffff',
    surface: '#f8fafc',
    border: '#e2e8f0',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#2563eb',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0B1214',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#35859B',
    primaryDark: '#1B6B7B',
    primaryDarker: '#145A63',
    cardBackground: '#111C1F',
    surface: '#0E1619',
    border: '#1E2C30',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
    info: '#60A5FA',
  },
};

export type ColorScheme = 'light' | 'dark';

/**
 * Design tokens — single source of truth for the visual language.
 * Screens should read these via `useTheme()` (hooks/useTheme.ts) rather than
 * importing a fixed scheme, so the app follows the system light/dark setting.
 */
const lightPalette = {
  primary: '#1B6B7B',
  primaryDark: '#145A63',
  primaryTint: '#E7F0F1', // ~8% primary on white, for tinted chips/tiles
  ink: '#0F172A', // headings
  text: '#334155', // body
  textSecondary: '#64748B', // supporting copy
  textMuted: '#94A3B8', // timestamps, captions
  textFaint: '#CBD5E1', // disabled/chevrons
  background: '#F6F8FA', // app canvas
  surface: '#FFFFFF', // cards
  surfaceMuted: '#F8FAFC', // insets inside cards
  border: '#E2E8F0', // card outlines
  borderLight: '#F1F5F9', // row dividers
  white: '#FFFFFF',
};

const darkPalette: typeof lightPalette = {
  primary: '#35859B',
  primaryDark: '#1B6B7B',
  primaryTint: '#12313A',
  ink: '#F1F5F9',
  text: '#CBD5E1',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textFaint: '#475569',
  background: '#0B1214',
  surface: '#111C1F',
  surfaceMuted: '#0E1619',
  border: '#1E2C30',
  borderLight: '#182226',
  white: '#FFFFFF',
};

export const Palettes: Record<ColorScheme, typeof lightPalette> = {
  light: lightPalette,
  dark: darkPalette,
};

/** Default/fallback palette for the (rare) module-scope reference that can't call the hook. */
export const Palette = lightPalette;

/** Semantic accent pairs: fg for text/icons, bg for tinted fills. */
const lightAccent = {
  red: { fg: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  amber: { fg: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  green: { fg: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0' },
  blue: { fg: '#2563EB', bg: '#DBEAFE', border: '#BFDBFE' },
  violet: { fg: '#7C3AED', bg: '#EDE9FE', border: '#DDD6FE' },
  cyan: { fg: '#0891B2', bg: '#CFFAFE', border: '#A5F3FC' },
  slate: { fg: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  teal: { fg: '#1B6B7B', bg: '#E7F0F1', border: '#CDE0E3' },
};

const darkAccent: typeof lightAccent = {
  red: { fg: '#F87171', bg: '#3F1D1D', border: '#5B2626' },
  amber: { fg: '#FBBF24', bg: '#3F2F0E', border: '#5B4419' },
  green: { fg: '#4ADE80', bg: '#123822', border: '#1C5233' },
  blue: { fg: '#60A5FA', bg: '#122A44', border: '#1D3E63' },
  violet: { fg: '#A78BFA', bg: '#2A1F44', border: '#3D2C63' },
  cyan: { fg: '#22D3EE', bg: '#0E2E36', border: '#164752' },
  slate: { fg: '#94A3B8', bg: '#1A2226', border: '#28353B' },
  teal: { fg: '#5FA6B8', bg: '#0F2A30', border: '#1B3D44' },
};

export const Accents: Record<ColorScheme, typeof lightAccent> = {
  light: lightAccent,
  dark: darkAccent,
};

/** Default/fallback accent set for the (rare) module-scope reference that can't call the hook. */
export const Accent = lightAccent;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const Radius = {
  sm: 8, // small chips, progress bars
  md: 12, // icon tiles, buttons, inputs
  lg: 16, // cards
  xl: 20, // hero surfaces
  pill: 999,
};

interface ShadowPreset {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/** Elevation presets — pair iOS shadows with Android elevation. */
const lightShadow: { card: ShadowPreset; raised: ShadowPreset } = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
};

const darkShadow: typeof lightShadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 1,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

export const Shadows: Record<ColorScheme, typeof lightShadow> = {
  light: lightShadow,
  dark: darkShadow,
};

/** Default/fallback shadow set for the (rare) module-scope reference that can't call the hook. */
export const Shadow = lightShadow;

/** Type scale — keep font sizes/weights consistent across screens; colors derive from a palette. */
export function getType(palette: typeof lightPalette) {
  return {
    screenTitle: { fontSize: 24, fontWeight: '800' as const, color: palette.ink, letterSpacing: -0.4 },
    title: { fontSize: 18, fontWeight: '700' as const, color: palette.ink },
    sectionTitle: { fontSize: 16, fontWeight: '700' as const, color: palette.ink },
    body: { fontSize: 14, color: palette.text },
    itemTitle: { fontSize: 15, fontWeight: '600' as const, color: palette.ink },
    caption: { fontSize: 12, color: palette.textSecondary },
    micro: { fontSize: 11, color: palette.textMuted },
    eyebrow: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: palette.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
    },
  };
}

export type AppType = ReturnType<typeof getType>;

/** Default/fallback type scale for the (rare) module-scope reference that can't call the hook. */
export const Type = getType(lightPalette);

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
