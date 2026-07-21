import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { BootLoader } from '@/components/ui/BootLoader';

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
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen name="vitals/[id]" options={{ title: 'Vital Signs' }} />
      <Stack.Screen name="tasks/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="tasks/quizzes/index" options={{ title: 'Quizzes' }} />
      <Stack.Screen name="tasks/quizzes/[id]" options={{ title: 'Quiz' }} />
      <Stack.Screen name="ehr/[id]" options={{ title: 'Patient Record' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="recommendations" options={{ title: 'AI Recommendations' }} />
      <Stack.Screen name="progress" options={{ title: 'Performance' }} />
    </Stack>
  );
}

// Session restore often resolves in a handful of milliseconds (no stored
// token, or a fast local network round-trip), which isn't enough time for
// the boot screen to render a single animation frame. Holding it for at
// least this long avoids an imperceptible flash on fast paths.
const MIN_BOOT_DISPLAY_MS = 700;

function AuthNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const router = useRouter();
  const [minDisplayElapsed, setMinDisplayElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDisplayElapsed(true), MIN_BOOT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const showBootLoader = isBootstrapping || !minDisplayElapsed;

  useEffect(() => {
    if (!showBootLoader) {
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }
  }, [showBootLoader, isAuthenticated, router]);

  // Only gate on the initial session restore; a login attempt in progress
  // must not unmount the login screen (it would wipe form and error state).
  if (showBootLoader) {
    return <BootLoader />;
  }

  return <AuthStack />;
}

export default function RootLayout() {
  const { scheme, isDark } = useTheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <StatusBar style={isDark ? 'light' : 'dark'} key={scheme} />
          <AuthNavigator />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}