import { useEffect, useSyncExternalStore } from 'react';
import {
  getNotificationsSnapshot,
  markAllRead,
  markRead,
  refreshNotifications,
  startNotificationStream,
  subscribeNotifications,
} from '@/lib/notifications-live';

/**
 * Reads the live notification store (see lib/notifications-live). Every
 * consumer shares one SSE connection, so the bell badge and the feed screen
 * always agree.
 */
export function useNotifications() {
  const state = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsSnapshot,
  );

  useEffect(() => {
    startNotificationStream();
  }, []);

  return {
    ...state,
    markRead,
    markAllRead,
    refresh: refreshNotifications,
  };
}
