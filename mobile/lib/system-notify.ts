/**
 * Shows a live notification as a system banner, so a new grade, case or
 * message gets noticed even on another screen. This covers the app while it
 * is open; push (lib/push) covers it closed or in the background.
 */

import { Platform } from 'react-native';
import { notificationsModule } from './notifications-module';
import type { AppNotification } from './api';
import { LIVE_CHANNEL_ID, notificationsOn } from './permissions';

let configured = false;
/**
 * Notifications already shown. With the app open, one notification can
 * arrive twice, from the live feed and as a push; only the first shows.
 */
const shown = new Set<string>();

/** Banners show while the app is in the foreground too (the default hides them). */
export function configureSystemNotifications() {
  const Notifications = notificationsModule();
  if (configured || !Notifications) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const id = notification.request.content.data?.notificationId;
      const seen = typeof id === 'string' && shown.has(id);
      if (typeof id === 'string') shown.add(id);
      return {
        shouldShowBanner: !seen,
        shouldShowList: !seen,
        shouldPlaySound: !seen,
        shouldSetBadge: false,
      };
    },
  });
}

export async function presentSystemNotification(notification: AppNotification) {
  const Notifications = notificationsModule();
  if (!Notifications) return;
  try {
    if (shown.has(notification.id) || !(await notificationsOn())) return;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: { notificationId: notification.id },
      },
      trigger: Platform.OS === 'android' ? { channelId: LIVE_CHANNEL_ID } : null,
    });
  } catch {
    // The in-app bell still has it.
  }
}

/** Opens the notifications screen when a banner is tapped. Returns the unsubscribe. */
export function onSystemNotificationTap(open: () => void) {
  const Notifications = notificationsModule();
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(() => open());
  return () => sub.remove();
}
