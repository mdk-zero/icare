import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';

/** Minimum gap between checks for a newer web version. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The student web app's version of useUpdatePrompt. A tab can stay open for
 * days, so it compares the version.json published beside the app
 * (scripts/publish-web.mjs) with the one it loaded with, and offers a reload
 * once there's a newer one. Asks rather than reloading, like the phone app,
 * so a half-finished quiz or write-up isn't thrown away. Off on the phone.
 */
export function useWebUpdatePrompt() {
  const loadedWith = useRef<string | null>(null);
  const prompted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const url = `${process.env.EXPO_BASE_URL ?? ''}/version.json`;
    let lastCheckAt = 0;

    const check = async () => {
      lastCheckAt = Date.now();
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const { commit, published_at } = (await res.json()) as { commit?: string; published_at?: string };
        const version = `${commit ?? ''}@${published_at ?? ''}`;
        if (loadedWith.current === null) {
          loadedWith.current = version;
          return;
        }
        if (version === loadedWith.current || prompted.current) return;
        prompted.current = true;
        Alert.alert(
          'Update ready',
          "A new version of iCARE++ is available. Reload now to use it, or it will load the next time you open iCARE++. Reloading closes anything you haven't saved.",
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Reload', onPress: () => window.location.reload() },
          ],
        );
      } catch {
        // Offline: the next check tries again.
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckAt >= CHECK_INTERVAL_MS) void check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
