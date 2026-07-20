import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

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

function AuthNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const { Palette } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (!isBootstrapping) {
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }
  }, [isBootstrapping, isAuthenticated, router]);

  // Only gate on the initial session restore; a login attempt in progress
  // must not unmount the login screen (it would wipe form and error state).
  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Palette.primaryDark }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
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