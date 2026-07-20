import { Tabs, useRouter, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import logoImg from "@/assets/images/logo-pill.png";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Palette } from "@/constants/theme";
import { fetchNotifications } from "@/lib/api";

/** Teal ramp sampled from the pill logo's cap (same as the login screen). */
const Teal = {
  deepest: "#082E38",
  deep: "#0D4550",
  primary: "#1B6B7B",
  light: "#35859B",
  mist: "#E7F0F1",
};

const TAB_ICONS: Record<string, string> = {
  vitals: "heart-pulse",
  tasks: "list-check",
  index: "house",
  ehr: "folder-open",
  profile: "user",
};

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabBarPill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const isFocused = state.index === index;
          const icon = TAB_ICONS[route.name] ?? "circle";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Home: raised gradient orb breaking out of the bar
          if (route.name === "index") {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={label}
                style={styles.centerSlot}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.centerOrbRing,
                      isFocused && styles.centerOrbRingFocused,
                      pressed && styles.pressedScale,
                    ]}
                  >
                    <LinearGradient
                      colors={[Teal.light, Teal.primary, Teal.deep]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.centerOrb}
                    >
                      <FontAwesome6 name={icon} size={22} solid color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                )}
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              style={({ pressed }) => [styles.sideTab, pressed && { opacity: 0.65 }]}
            >
              <FontAwesome6
                name={icon}
                size={18}
                solid
                color={isFocused ? Teal.primary : Palette.textMuted}
              />
              <Text style={[styles.sideTabLabel, isFocused && styles.sideTabLabelFocused]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AppHeader({ notificationCount }: { notificationCount: number }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.headerContainer} edges={["top"]}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <Image source={logoImg} style={styles.logo} />
          <Text style={styles.headerTitle}>CARE++</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.notificationButton,
            pressed && styles.notificationButtonPressed,
          ]}
          onPress={() => router.push("/notifications")}
          hitSlop={8}
        >
          <View style={styles.notificationIconBox}>
            <Ionicons name="notifications-outline" size={20} color={Palette.primary} />
          </View>
          {notificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {notificationCount > 9 ? "9+" : notificationCount}
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
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="vitals" options={{ title: "Vitals" }} />
        <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="ehr" options={{ title: "EHR" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </View>
  );
}

const ORB_SIZE = 58;

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: Palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.border,
    zIndex: 1,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: Palette.primary,
    letterSpacing: 0.3,
    marginLeft: -10,
    marginTop: 8,
  },
  notificationButton: {
    position: "relative",
  },
  notificationButtonPressed: {
    opacity: 0.6,
  },
  notificationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Palette.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Palette.surface,
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  tabBarWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  tabBarPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 62,
    backgroundColor: "#FFFFFF",
    borderRadius: 31,
    borderWidth: 1,
    borderColor: Palette.borderLight,
    paddingHorizontal: 6,
    shadowColor: Teal.deepest,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 14,
  },
  sideTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  sideTabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Palette.textMuted,
  },
  sideTabLabelFocused: {
    color: Teal.primary,
    fontWeight: "700",
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
  },
  centerOrbRing: {
    width: ORB_SIZE + 10,
    height: ORB_SIZE + 10,
    borderRadius: (ORB_SIZE + 10) / 2,
    marginTop: -26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Palette.borderLight,
    shadowColor: Teal.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  centerOrbRingFocused: {
    borderColor: Teal.mist,
    borderWidth: 3,
  },
  centerOrb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressedScale: {
    transform: [{ scale: 0.94 }],
  },
});
