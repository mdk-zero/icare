import { Platform } from 'react-native';

const tintColorLight = '#1B6B7B';
const tintColorDark = '#1B6B7B';

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
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    primary: '#1B6B7B',
    primaryDark: '#145a63',
    primaryDarker: '#155663',
    cardBackground: '#1e1e1e',
    surface: '#1a1a1a',
    border: '#2d2d2d',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#2563eb',
  },
};

/**
 * Design tokens — single source of truth for the visual language.
 * Screens should pull from these instead of hardcoding hex values.
 */
export const Palette = {
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

/** Semantic accent pairs: fg for text/icons, bg for tinted fills. */
export const Accent = {
  red: { fg: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
  amber: { fg: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  green: { fg: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0' },
  blue: { fg: '#2563EB', bg: '#DBEAFE', border: '#BFDBFE' },
  violet: { fg: '#7C3AED', bg: '#EDE9FE', border: '#DDD6FE' },
  cyan: { fg: '#0891B2', bg: '#CFFAFE', border: '#A5F3FC' },
  slate: { fg: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
  teal: { fg: '#1B6B7B', bg: '#E7F0F1', border: '#CDE0E3' },
};

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

/** Elevation presets — pair iOS shadows with Android elevation. */
export const Shadow = {
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
} as const;

/** Type scale — keep font sizes/weights consistent across screens. */
export const Type = {
  screenTitle: { fontSize: 24, fontWeight: '800' as const, color: Palette.ink, letterSpacing: -0.4 },
  title: { fontSize: 18, fontWeight: '700' as const, color: Palette.ink },
  sectionTitle: { fontSize: 16, fontWeight: '700' as const, color: Palette.ink },
  body: { fontSize: 14, color: Palette.text },
  itemTitle: { fontSize: 15, fontWeight: '600' as const, color: '#1E293B' },
  caption: { fontSize: 12, color: Palette.textSecondary },
  micro: { fontSize: 11, color: Palette.textMuted },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Palette.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
};

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