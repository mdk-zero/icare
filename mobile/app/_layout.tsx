import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

function AuthStack() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen name="vitals/[id]" options={{ headerShown: true, title: 'Vital Signs' }} />
      <Stack.Screen name="tasks/[id]" options={{ headerShown: true, title: 'Task' }} />
      <Stack.Screen name="tasks/quizzes/index" options={{ headerShown: true, title: 'Quizzes', headerTintColor: '#1B6B7B', headerStyle: { backgroundColor: '#fff' } }} />
      <Stack.Screen name="tasks/quizzes/[id]" options={{ headerShown: true, title: 'Quiz' }} />
      <Stack.Screen name="ehr/[id]" options={{ headerShown: true, title: 'Patient Record' }} />
      <Stack.Screen name="ehr/[id]/tpr" options={{ headerShown: true, title: 'TPR Sheet' }} />
      <Stack.Screen name="ehr/[id]/ivf" options={{ headerShown: true, title: 'IVF Sheet' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
      <Stack.Screen name="recommendations" options={{ headerShown: true, title: 'AI Recommendations' }} />
      <Stack.Screen name="progress" options={{ headerShown: true, title: 'Performance' }} />
    </Stack>
  );
}

function AuthNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1B6B7B' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return <AuthStack />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <AuthNavigator />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}