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
import { getToken, clearToken, flushOutbox, isNetworkError } from "@/lib/client";

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
  ) => Promise<{ ok: boolean; needsRoleSelection?: boolean; error?: string }>;
  logout: () => Promise<void>;
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
      } else {
        // Server reachable but the token is invalid/expired.
        await clearToken();
        await AsyncStorage.removeItem(USER_KEY);
        setUser(null);
      }
    } catch (error) {
      if (isNetworkError(error)) {
        // Offline with a stored token: restore the last-known identity so
        // cached data stays usable with no connection.
        const stored = await AsyncStorage.getItem(USER_KEY);
        if (stored) setUser(JSON.parse(stored) as apiClient.User);
      } else {
        setUser(null);
      }
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
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
  ): Promise<{ ok: boolean; needsRoleSelection?: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await apiClient.loginWithGoogle(idToken, rememberMe);
      if ("needsRoleSelection" in result) {
        return { ok: false, needsRoleSelection: true };
      }
      setUser(result.user);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user)).catch(() => {});
      flushOutbox().catch(() => {});
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
    await apiClient.logout();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  };

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
