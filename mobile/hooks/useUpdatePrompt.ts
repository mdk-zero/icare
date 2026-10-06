import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

/** Minimum gap between update checks triggered by reopening the app. */
const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Offers a restart once an over-the-air update (EAS Update) has downloaded.
 *
 * The native side already checks on every cold start and downloads in the
 * background, but Android can keep the app alive for days, so this also checks
 * whenever the app returns to the foreground. It asks instead of reloading on
 * its own because a reload would throw away a half-finished quiz or write-up.
 * Declining is safe: a downloaded update applies on the next cold start anyway.
 *
 * A no-op in development and on web, where `Updates.isEnabled` is false.
 */
export function useUpdatePrompt() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const promptedFor = useRef<string | null>(null);
  const lastCheckAt = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastCheckAt.current < FOREGROUND_CHECK_INTERVAL_MS) return;
      lastCheckAt.current = now;
      (async () => {
        try {
          const { isAvailable } = await Updates.checkForUpdateAsync();
          if (isAvailable) await Updates.fetchUpdateAsync();
        } catch {
          // Offline or the update server is unreachable: the next foreground
          // or cold start tries again, and nothing the student sees depends on it.
        }
      })();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isUpdatePending) return;
    // Ask once per downloaded update, not on every re-render that still sees it pending.
    const id = downloadedUpdate?.updateId ?? 'pending';
    if (promptedFor.current === id) return;
    promptedFor.current = id;
    Alert.alert(
      'Update ready',
      "A new version of iCARE++ has downloaded. Restart now to use it, or it will load the next time you open the app. Restarting closes anything you haven't saved.",
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Restart',
          // If the reload itself fails the update still applies on the next
          // cold start, so there is nothing more useful to do with the error.
          onPress: () => Updates.reloadAsync().catch(() => {}),
        },
      ],
    );
  }, [isUpdatePending, downloadedUpdate]);
}
