/**
 * expo-notifications, loaded only where it works. Expo Go on Android throws
 * as soon as the module is imported (remote notifications were removed from
 * it in SDK 53), so it's required lazily and never in Expo Go or on web:
 * there, notification features are simply off and the in-app feed still
 * works. A development or store build has the module.
 */

import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');

/** Running inside Expo Go rather than our own build. */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let loaded: NotificationsModule | null | undefined;

export function notificationsModule(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS === 'web' || inExpoGo) {
    loaded = null;
    return loaded;
  }
  try {
    // A static import would run (and throw) in Expo Go before any check could.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as NotificationsModule;
  } catch {
    loaded = null;
  }
  return loaded;
}
