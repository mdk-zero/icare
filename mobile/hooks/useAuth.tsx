import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as apiClient from "@/lib/api";
import {
  ApiError,
  clearCache,
  clearToken,
  flushOutbox,
  getToken,
  isNetworkError,
  isTokenSwapInFlight,
  onUnauthorized,
} from "@/lib/client";
import { startNotificationStream, stopNotificationStream } from "@/lib/notifications-live";

const USER_KEY = "@icare_user";

interface AuthContextType {
  user: apiClient.User | null;
  /** True while a login/logout request is in flight. */
  isLoading: boolean;
  /** True only during the initial stored-session restore at app launch. */
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  loginWithGoogle: (
    idToken: string,
    rememberMe?: boolean,
  ) => Promise<{ ok: boolean; onboardingToken?: string; error?: string }>;
  logout: () => Promise<void>;
  /** Re-reads the session, e.g. after a password change or profile edit. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<apiClient.User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const sessionUser = await apiClient.fetchSession();
      if (sessionUser) {
        setUser(sessionUser);
        AsyncStorage.setItem(USER_KEY, JSON.stringify(sessionUser)).catch(() => {});
        // Push any writes queued while offline now that we know we're online.
        flushOutbox().catch(() => {});
        startNotificationStream();
      } else {
        // Server reachable but the token is invalid/expired.
        await clearToken();
        await clearCache();
        await AsyncStorage.removeItem(USER_KEY);
        setUser(null);
      }
    } catch (error) {
      // Offline, or the server failed (5xx) — neither says the session is
      // gone. Restore the last-known identity so cached data stays usable.
      if (isNetworkError(error) || (error instanceof ApiError && error.status >= 500)) {
        const stored = await AsyncStorage.getItem(USER_KEY);
        if (stored) setUser(JSON.parse(stored) as apiClient.User);
      } else {
        setUser(null);
      }
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  // A 401 on a signed-in request: ask the server whether the session is really
  // gone before acting, then sign out cleanly instead of leaving the app
  // looking signed in while every call fails.
  useEffect(() => {
    let checking = false;
    onUnauthorized(() => {
      if (checking || isTokenSwapInFlight()) return;
      checking = true;
      // Give an in-flight password change time to store its fresh token, so
      // the check below runs with it rather than the one just revoked.
      new Promise((resolve) => setTimeout(resolve, 3000))
        .then(() => apiClient.fetchSession())
        .then(async (sessionUser) => {
          if (sessionUser || isTokenSwapInFlight()) return;
          stopNotificationStream();
          await clearToken();
          // Cached reads are keyed by path, not user: the next account on
          // this device must not see them.
          await clearCache();
          await AsyncStorage.removeItem(USER_KEY);
          setUser(null);
        })
        .catch(() => {
          // Offline or a server error: nothing is known, so keep the session.
        })
        .finally(() => {
          checking = false;
        });
    });
    return () => onUnauthorized(null);
  }, []);

  useEffect(() => {
    // checkAuth is an async function whose every state write follows an
    // await, so none of them run synchronously in this effect body. The rule
    // cannot see across the module boundary to prove that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();
  }, [checkAuth]);

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean = true,
  ): Promise<{ ok: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const loggedIn = await apiClient.login(email.trim().toLowerCase(), password, rememberMe);
      setUser(loggedIn);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(loggedIn)).catch(() => {});
      flushOutbox().catch(() => {});
      startNotificationStream();
      return { ok: true };
    } catch (error) {
      const message = isNetworkError(error)
        ? "Cannot reach the iCARE++ server. Check your connection and API URL."
        : error instanceof Error
          ? error.message
          : "Sign-in failed";
      return { ok: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (
    idToken: string,
    rememberMe: boolean = true,
  ): Promise<{ ok: boolean; onboardingToken?: string; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await apiClient.loginWithGoogle(idToken, rememberMe);
      if ("needsAccount" in result) {
        return { ok: false, onboardingToken: result.onboardingToken };
      }
      setUser(result.user);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user)).catch(() => {});
      flushOutbox().catch(() => {});
      startNotificationStream();
      return { ok: true };
    } catch (error) {
      const message = isNetworkError(error)
        ? "Cannot reach the iCARE++ server. Check your connection and API URL."
        : error instanceof Error
          ? error.message
          : "Google sign-in failed";
      return { ok: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    // Before the token goes away, so the live feed doesn't reconnect into a 401
    // and leak the previous account's notifications into the next session.
    stopNotificationStream();
    await apiClient.logout();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    try {
      const sessionUser = await apiClient.fetchSession();
      if (sessionUser) {
        setUser(sessionUser);
        AsyncStorage.setItem(USER_KEY, JSON.stringify(sessionUser)).catch(() => {});
      }
    } catch {
      // Offline or transient: keep the identity we already have.
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isBootstrapping,
        isAuthenticated: !!user,
        login,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
