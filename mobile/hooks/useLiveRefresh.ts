import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onNotificationArrived } from '@/lib/notifications-live';

/**
 * Keeps a screen's data current without a pull-to-refresh: it reloads when a
 * notification arrives on the live feed (a quiz assigned or published, a case
 * graded), and, while the screen is in front, every `pollMs` as a fallback for
 * changes that send no notification. Bursts of arrivals reload once.
 */
export function useLiveRefresh(reload: () => void, { pollMs }: { pollMs?: number } = {}) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onNotificationArrived(() => {
      if (timer) clearTimeout(timer);
      // A short wait lets the server finish the write the notification is about.
      timer = setTimeout(() => reloadRef.current(), 400);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!pollMs) return;
      const interval = setInterval(() => {
        if (AppState.currentState === 'active') reloadRef.current();
      }, pollMs);
      return () => clearInterval(interval);
    }, [pollMs]),
  );
}
