import { useColorScheme as useRNColorScheme } from 'react-native';
import { ColorScheme } from '@/constants/theme';

/**
 * react-native reports 'unspecified' when the device expresses no preference.
 * The design tokens only model light/dark, so collapse it to light.
 */
export function useColorScheme(): ColorScheme {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
