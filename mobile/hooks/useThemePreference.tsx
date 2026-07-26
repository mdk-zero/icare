import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The user's chosen appearance. 'system' defers to the device's light/dark
 * setting; 'light'/'dark' pin the app regardless of the device. Persisted so
 * the choice survives relaunch. `useTheme` reads this to resolve the palette.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@icare_theme_preference';

interface ThemePreferenceValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the stored choice has been read back on cold start. */
  ready: boolean;
}

// A safe default so `useTheme` never throws if it renders above the provider
// (e.g. during an edge-case fast refresh) — it simply falls back to 'system'.
const ThemePreferenceContext = React.createContext<ThemePreferenceValue>({
  preference: 'system',
  setPreference: () => {},
  ready: true,
});

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // no stored choice or storage unavailable — keep 'system'
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // best effort; the in-memory choice still applies this session
    });
  }, []);

  const value = React.useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  return React.useContext(ThemePreferenceContext);
}
