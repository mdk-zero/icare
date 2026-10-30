import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { ThemePreferenceProvider } from '@/hooks/useThemePreference';
import { useUpdatePrompt } from '@/hooks/useUpdatePrompt';
import { BootLoader } from '@/components/ui/BootLoader';
import { ConnectionToast } from '@/components/ui/ConnectionToast';
import { startConnectivityMonitor } from '@/lib/client';
import { hasOnboarded } from '@/lib/permissions';
import { configureSystemNotifications, onSystemNotificationTap } from '@/lib/system-notify';

function AuthStack() {
  const { Palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Palette.surface },
        headerTintColor: Palette.primary,
        headerTitleStyle: { fontWeight: '700', color: Palette.ink },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Palette.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(instructor)" options={{ headerShown: false }} />
      <Stack.Screen name="web-portal" options={{ headerShown: false }} />
      <Stack.Screen name="course/[id]" options={{ title: "Course" }} />
      <Stack.Screen name="student/[id]" options={{ title: "Student" }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen name="clinic/room/[id]" options={{ title: 'Room' }} />
      <Stack.Screen name="clinic/patient/[id]" options={{ title: 'Patient' }} />
      <Stack.Screen name="clinic/assignment/[id]" options={{ title: 'Patient Case' }} />
      <Stack.Screen name="retdem/[id]" options={{ title: 'Return Demonstration' }} />
      <Stack.Screen name="cases/[id]" options={{ title: 'Case Presentation' }} />
      {/* Draws its own top bar: none at all while a quiz is open (strict mode). */}
      <Stack.Screen name="quiz/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="quiz-info/[id]" options={{ title: 'Quiz' }} />
      <Stack.Screen name="flashcards/[id]" options={{ title: 'Flashcards' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="library/[id]" options={{ title: 'Library' }} />
      <Stack.Screen name="progress" options={{ title: 'Performance' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="account/password" options={{ title: 'Change Password' }} />
      <Stack.Screen name="assistance" options={{ title: 'Request Assistance' }} />
      <Stack.Screen name="help" options={{ title: 'Help & Support' }} />
      <Stack.Screen
        name="change-password"
        options={{ title: 'Set a New Password', headerBackVisible: false }}
      />
    </Stack>
  );
}

// Session restore often resolves in a handful of milliseconds (no stored
// token, or a fast local network round-trip), which isn't enough time for
// the boot screen to render a single animation frame. Holding it for at
// least this long avoids an imperceptible flash on fast paths.
const MIN_BOOT_DISPLAY_MS = 700;

function AuthNavigator() {
  const { isAuthenticated, isBootstrapping, user } = useAuth();
  const router = useRouter();
  const [minDisplayElapsed, setMinDisplayElapsed] = useState(false);
  // Whether this device has seen the welcome screen; null until read.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMinDisplayElapsed(true), MIN_BOOT_DISPLAY_MS);
    void hasOnboarded().then(setOnboarded);
    return () => clearTimeout(timer);
  }, []);

  // A tapped notification banner opens the feed.
  useEffect(() => onSystemNotificationTap(() => router.push('/notifications')), [router]);

  const showBootLoader = isBootstrapping || !minDisplayElapsed || onboarded === null;
  // Accounts an admin provisioned carry a temporary password. The web app
  // forces the change before anything else; mobile used to let them straight
  // in and keep the temp password indefinitely.
  const mustChangePassword = Boolean(user?.force_password_change);

  useEffect(() => {
    if (!showBootLoader) {
      if (!isAuthenticated) {
        // First launch: the welcome screen asks for permissions, then hands over to sign-in.
        router.replace(onboarded ? '/login' : '/welcome');
      } else if (mustChangePassword) {
        router.replace('/change-password');
      }
    }
  }, [showBootLoader, isAuthenticated, mustChangePassword, onboarded, router]);

  // Only gate on the initial session restore; a login attempt in progress
  // must not unmount the login screen (it would wipe form and error state).
  if (showBootLoader) {
    return <BootLoader />;
  }

  return <AuthStack />;
}

// Consumes useTheme, so it must render inside ThemePreferenceProvider for the
// nav theme and status bar to follow an explicit Light/Dark override.
function ThemedApp() {
  const { scheme, isDark } = useTheme();

  // App-lifetime reachability heartbeat: without it the app only learns it is
  // offline when a request the student made happens to fail.
  useEffect(() => startConnectivityMonitor(), []);
  useEffect(() => configureSystemNotifications(), []);
  useUpdatePrompt();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} key={scheme} />
      {/* The toast is a sibling of the navigator so it floats over every
          screen — boot loader and login included — instead of each one
          having to make room for it. */}
      <View style={{ flex: 1 }}>
        <AuthNavigator />
        <ConnectionToast />
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}