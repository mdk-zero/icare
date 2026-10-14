/**
 * Permissions: notifications (live grades, new cases and instructor
 * messages) and the camera (taking a profile picture). The welcome screen and Settings in
 * Profile turn them on and off with a switch.
 *
 * The OS can't take a permission back from inside the app, so turning
 * notifications off is the app's own choice (no banners, no push); the
 * camera can only be turned off in the device's Settings.
 */

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationsModule } from './notifications-module';
import * as ImagePicker from 'expo-image-picker';

export type PermissionState = 'undetermined' | 'granted' | 'denied';

/** Notifications can be asked for here (not in Expo Go or on web). */
export function notificationsAvailable(): boolean {
  return notificationsModule() !== null;
}

const ONBOARDED_KEY = 'icare:onboarded';
const NOTIFICATIONS_ON_KEY = 'icare:notifications-on';

/** The user's own notifications switch; on unless they turned it off. */
export async function notificationsOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTIFICATIONS_ON_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setNotificationsOn(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ON_KEY, on ? '1' : '0');
  } catch {
    // The switch falls back to on next launch.
  }
}

/** The Android channel live notifications post to. */
export const LIVE_CHANNEL_ID = 'live';

/** Whether this device has been through the welcome screen. */
export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Development only: forget the welcome screen was seen, to test first launch again. */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // Nothing to forget.
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Not remembering it only means the welcome screen shows again.
  }
}

/**
 * 'denied' only once the OS won't show its prompt again (declined for good):
 * from then on only Settings can change it. A first "Don't allow" on Android
 * can still be asked again, so it stays 'undetermined'.
 */
function toState(status: { granted: boolean; canAskAgain: boolean }): PermissionState {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Android 13+ shows the notification prompt only once a channel exists, so
 * the channel is made first. High importance lets a new grade or message
 * appear as a heads-up banner.
 */
async function ensureChannel() {
  const Notifications = notificationsModule();
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(LIVE_CHANNEL_ID, {
    name: 'Grades, cases and messages',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#1B6B7B',
    vibrationPattern: [0, 180, 120, 180],
  });
}

export async function notificationPermission(): Promise<PermissionState> {
  const Notifications = notificationsModule();
  if (!Notifications) return 'undetermined';
  try {
    return toState(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  const Notifications = notificationsModule();
  if (!Notifications) return 'undetermined';
  try {
    await ensureChannel();
    return toState(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    );
  } catch {
    return 'denied';
  }
}

/**
 * The camera, for taking a profile picture. Choosing one from the gallery
 * needs no permission: Android 13+ and iOS hand that to the system photo
 * picker, so a "photos" permission would always read as allowed and never
 * match the phone's Settings. The camera is the permission that does.
 */
export async function cameraPermission(): Promise<PermissionState> {
  try {
    return toState(await ImagePicker.getCameraPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

export async function requestCameraPermission(): Promise<PermissionState> {
  try {
    return toState(await ImagePicker.requestCameraPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Where a permission declined for good can still be turned on. */
export function openSettings() {
  void Linking.openSettings();
}
