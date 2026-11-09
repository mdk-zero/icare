import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { ThemePreferenceProvider } from '@/hooks/useThemePreference';
import { useUpdatePrompt } from '@/hooks/useUpdatePrompt';
import { useWebUpdatePrompt } from '@/hooks/useWebUpdatePrompt';
import { BootLoader } from '@/components/ui/BootLoader';
import { ConnectionToast } from '@/components/ui/ConnectionToast';
import { StudentWebOff } from '@/components/web/StudentWebOff';
import { WebAlertHost } from '@/components/web/WebAlertHost';
import { startConnectivityMonitor } from '@/lib/client';
import { hasOnboarded } from '@/lib/permissions';
import { isStudentWeb, studentWebOn } from '@/lib/student-web';
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
      <Stack.Screen
        name="ai-consent"
        options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
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
  // The student web app only: whether an Admin has it on (lib/student-web),
  // null until read. Always on for the phone app, and for a signed-in
  // student: the server signs web sessions out while it's off.
  const [webSwitch, setWebSwitch] = useState<boolean | null>(null);
  const webOn = !isStudentWeb || isAuthenticated ? true : webSwitch;

  useEffect(() => {
    const timer = setTimeout(() => setMinDisplayElapsed(true), MIN_BOOT_DISPLAY_MS);
    void hasOnboarded().then(setOnboarded);
    return () => clearTimeout(timer);
  }, []);

  // Asked at start and again whenever nobody is signed in: turning it off
  // signs web students out, and they should land on why, not a sign-in form.
  useEffect(() => {
    if (!isStudentWeb || isBootstrapping || isAuthenticated) return;
    void studentWebOn().then(setWebSwitch);
  }, [isBootstrapping, isAuthenticated]);

  // A tapped notification banner opens the feed.
  useEffect(() => onSystemNotificationTap(() => router.push('/notifications')), [router]);

  const showBootLoader = isBootstrapping || !minDisplayElapsed || onboarded === null || webOn === null;
  // Accounts an admin provisioned carry a temporary password. The web app
  // forces the change before anything else; mobile used to let them straight
  // in and keep the temp password indefinitely.
  const mustChangePassword = Boolean(user?.force_password_change);

  useEffect(() => {
    // Nothing to route while the web version's "turned off" screen stands
    // in for the navigator: in a browser, routing with no navigator mounted
    // reloads the page, and the check that follows routes again.
    if (!showBootLoader && webOn) {
      if (!isAuthenticated) {
        // First launch: the welcome screen asks for permissions, then hands over to sign-in.
        router.replace(onboarded ? '/login' : '/welcome');
      } else if (mustChangePassword) {
        router.replace('/change-password');
      }
    }
  }, [showBootLoader, webOn, isAuthenticated, mustChangePassword, onboarded, router]);

  // Only gate on the initial session restore; a login attempt in progress
  // must not unmount the login screen (it would wipe form and error state).
  if (showBootLoader) {
    return <BootLoader />;
  }

  if (!webOn && !isAuthenticated) {
    return <StudentWebOff onCheckAgain={async () => setWebSwitch(await studentWebOn())} />;
  }

  return <AuthStack />;
}

// Consumes useTheme, so it must render inside ThemePreferenceProvider for the
// nav theme and status bar to follow an explicit Light/Dark override.
/**
 * The student web app on a wide window: the phone layout stretched across a
 * desktop screen reads badly, so it sits in a column no wider than a tablet
 * (the Library's video player already stops at 900).
 */
const WEB_COLUMN = Platform.OS === 'web' ? ({ width: '100%', maxWidth: 900, alignSelf: 'center', overflow: 'hidden' } as const) : null;

function ThemedApp() {
  const { scheme, isDark, Palette } = useTheme();

  // App-lifetime reachability heartbeat: without it the app only learns it is
  // offline when a request the student made happens to fail.
  useEffect(() => startConnectivityMonitor(), []);
  useEffect(() => configureSystemNotifications(), []);
  useUpdatePrompt();
  useWebUpdatePrompt();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} key={scheme} />
      {/* The toast is a sibling of the navigator so it floats over every
          screen — boot loader and login included — instead of each one
          having to make room for it. */}
      <View style={{ flex: 1, backgroundColor: WEB_COLUMN ? Palette.border : undefined }}>
        <View style={[{ flex: 1 }, WEB_COLUMN, WEB_COLUMN && { backgroundColor: Palette.background }]}>
          <AuthNavigator />
          <ConnectionToast />
        </View>
        <WebAlertHost />
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