/**
 * Push notifications for when the app is closed or in the background. The
 * live feed (notifications-live) covers the app while it's open; this
 * registers the device's Expo push token with the server, which then sends
 * every new notification to it (migration 072).
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './client';
import { notificationsModule } from './notifications-module';
import { notificationsOn } from './permissions';

const TOKEN_KEY = 'icare:push-token';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device for the signed-in user's notifications. Asks no
 * question: it only runs if notifications are allowed and switched on.
 * Safe to call on every sign-in and app start.
 */
export async function registerForPush(): Promise<void> {
  const Notifications = notificationsModule();
  if (!Notifications) return;
  try {
    if (!(await notificationsOn())) return;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await api('/api/push-tokens', { method: 'POST', body: { token, platform: Platform.OS } });
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    // An emulator, no push credentials yet, or offline: the live feed still works while open.
    console.warn('Push registration skipped:', err instanceof Error ? err.message : err);
  }
}

/** Stops pushes to this device; call before the session token is cleared on sign-out. */
export async function unregisterFromPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await api('/api/push-tokens', { method: 'DELETE', body: { token } });
  } catch {
    // Offline: the next account to sign in here takes the token over anyway.
  }
}
