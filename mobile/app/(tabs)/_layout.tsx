import { Tabs, useRouter, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Platform } from 'react-native';
import logoImg from '@/assets/images/logo-pill.png';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Palette } from '@/constants/theme';
import { fetchNotifications } from '@/lib/api';

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'home', inactive: 'home-outline' },
  vitals: { active: 'pulse', inactive: 'pulse-outline' },
  tasks: { active: 'clipboard', inactive: 'clipboard-outline' },
  ehr: { active: 'folder-open', inactive: 'folder-open-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: Palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.border,
    zIndex: 1,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Palette.primary,
    letterSpacing: 0.3,
    marginLeft: 10,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationButtonPressed: {
    opacity: 0.6,
  },
  notificationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Palette.surface,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  tabBar: {
    backgroundColor: Palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
    height: Platform.select({ ios: 84, default: 64 }),
    paddingTop: 6,
    elevation: 0,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});

function AppHeader({ notificationCount }: { notificationCount: number }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.headerContainer} edges={['top']}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <Image source={logoImg} style={styles.logo} />
          <Text style={styles.headerTitle}>iCARE++</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.notificationButton, pressed && styles.notificationButtonPressed]}
          onPress={() => router.push('/notifications')}
          hitSlop={8}
        >
          <View style={styles.notificationIconBox}>
            <Ionicons name="notifications-outline" size={20} color={Palette.primary} />
          </View>
          {notificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function TabLayout() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  // Refresh the badge whenever the active tab changes (cheap, cached read).
  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((result) => {
        if (!cancelled) setUnreadCount(result.data.unread ?? 0);
      })
      .catch(() => {
        // offline with no cache; keep the last known count
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.background }}>
      <AppHeader notificationCount={unreadCount} />
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: Palette.primary,
          tabBarInactiveTintColor: Palette.textMuted,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ focused, color }) => {
            const icons = TAB_ICONS[route.name] ?? TAB_ICONS.index;
            return <Ionicons name={focused ? icons.active : icons.inactive} size={22} color={color} />;
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="vitals" options={{ title: 'Vitals' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="ehr" options={{ title: 'EHR' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  );
}
