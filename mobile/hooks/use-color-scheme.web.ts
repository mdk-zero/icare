import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { ColorScheme } from '@/constants/theme';

/** Hydration state never changes after mount, so there is nothing to subscribe to. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 *
 * useSyncExternalStore hands back the server snapshot while hydrating and the
 * client one afterwards, which keeps markup consistent without an effect that
 * sets state and re-renders on every mount.
 */
export function useColorScheme(): ColorScheme {
  const hasHydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme === 'dark' ? 'dark' : 'light';
  }

  return 'light';
}
