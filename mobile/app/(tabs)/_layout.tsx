import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import logoImg from '@/assets/images/logo-pill.png';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { mockNotifications } from '@/lib/api';

const primaryColor = Colors.light.primary;

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 1,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    shadowColor: primaryColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  headerText: {
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: primaryColor,
    letterSpacing: 0.5,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginLeft: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: primaryColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarContainer: {
    backgroundColor: '#fff',
    height: 85,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tabIcon: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    position: 'relative',
  },
  tabIconActive: {
    backgroundColor: `${primaryColor}15`,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: primaryColor,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: primaryColor,
    marginTop: 4,
  },
  notificationButtonContainer: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

function HeaderTitle({ notificationCount }: { notificationCount: number }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.headerContainer} edges={['top']}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <Image
              source={logoImg}
              style={styles.logo}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>iCARE++</Text>
            <View style={styles.subtitleRow}>
              <Ionicons name="shield-checkmark" size={12} color="#16a34a" />
              <Text style={styles.headerSubtitle}>Healthcare Dashboard</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.notificationButton} 
            onPress={() => router.push('/notifications')}
          >
            <View style={styles.notificationIconBox}>
              <Ionicons name="notifications-outline" size={22} color={primaryColor} />
            </View>
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function TabIcon({ name, focused, showBadge }: { name: string; focused: boolean; showBadge?: boolean }) {
  const icons: Record<string, string> = {
    index: 'home',
    vitals: 'heart',
    tasks: 'clipboard',
    ehr: 'folder-open',
    profile: 'person',
  };
  const labels: Record<string, string> = {
    index: 'Dashboard',
    vitals: 'Vitals',
    tasks: 'Tasks',
    ehr: 'EHR',
    profile: 'Profile',
  };
  return (
    <View style={styles.tabIconContainer}>
      <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
        <Ionicons
          name={icons[name] as any}
          size={22}
          color={focused ? primaryColor : '#9ca3af'}
        />
        {focused && <View style={styles.activeIndicator} />}
        {showBadge && !focused && <View style={styles.badge} />}
      </View>

    </View>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]} edges={['bottom']}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <View key={route.key} style={styles.tabIcon}>
            <Ionicons
              name={route.name === 'index' ? 'home' : route.name === 'vitals' ? 'heart' : route.name === 'tasks' ? 'clipboard' : route.name === 'ehr' ? 'folder-open' : 'person' as any}
              size={22}
              color={isFocused ? primaryColor : '#9ca3af'}
              onPress={onPress}
            />
          </View>
        );
      })}
    </SafeAreaView>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <HeaderTitle notificationCount={unreadCount} />
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: primaryColor,
            tabBarInactiveTintColor: '#9ca3af',
            headerShown: false,
            tabBarStyle: [styles.tabBarContainer, { paddingBottom: insets.bottom }],
            tabBarLabelStyle: {
              display: 'none',
            },
            tabBarItemStyle: {
              paddingVertical: 0,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon name="index" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="vitals"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon name="vitals" focused={focused} showBadge />,
            }}
          />
          <Tabs.Screen
            name="tasks"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon name="tasks" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="ehr"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon name="ehr" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}
