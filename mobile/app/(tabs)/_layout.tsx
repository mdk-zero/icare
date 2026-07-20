import { Tabs, useRouter, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import logoImg from "@/assets/images/logo-pill.png";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
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

/** One tab: springs wide into a gradient pill when focused, rests as a quiet icon otherwise. */
function TabItem({
  icon,
  label,
  isFocused,
  onPress,
}: {
  icon: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, { damping: 12, stiffness: 140 });
  }, [isFocused, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    flex: 1 + progress.value,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.75, 1]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.18]) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: progress.value * 72,
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-8, 0]) }],
  }));

  return (
    <Animated.View style={[styles.tabItem, containerStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.tabPressable, pressed && !isFocused && { opacity: 0.65 }]}
      >
        <Animated.View style={[styles.activePill, fillStyle]}>
          <LinearGradient
            colors={[Teal.light, Teal.primary, Teal.deep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.tabRow}>
          <Animated.View style={iconStyle}>
            <FontAwesome6
              name={icon}
              size={18}
              solid
              color={isFocused ? "#FFFFFF" : Palette.textMuted}
            />
          </Animated.View>
          <Animated.Text numberOfLines={1} style={[styles.tabLabel, labelStyle]}>
            {label}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.tabBarPill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const isFocused = state.index === index;

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

          return (
            <TabItem
              key={route.key}
              icon={TAB_ICONS[route.name] ?? "circle"}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Faint ECG trace + light bloom drifting along the header's bottom edge. */
function HeaderPulse({ width }: { width: number }) {
  const y = 62;
  const pulse = [
    `M0 ${y}`,
    `L${width * 0.3} ${y}`,
    `L${width * 0.36} ${y - 16}`,
    `L${width * 0.42} ${y + 20}`,
    `L${width * 0.47} ${y - 5}`,
    `L${width * 0.52} ${y}`,
    `L${width * 0.78} ${y}`,
    `L${width * 0.83} ${y - 12}`,
    `L${width * 0.88} ${y + 14}`,
    `L${width * 0.92} ${y}`,
    `L${width} ${y}`,
  ].join(" ");

  return (
    <Svg
      width={width}
      height={90}
      style={{ position: "absolute", bottom: 0, left: 0 }}
      pointerEvents="none"
    >
      <Circle cx={width * 0.92} cy={10} r={70} fill="#FFFFFF" fillOpacity={0.05} />
      <Circle cx={width * 0.05} cy={85} r={50} fill="#FFFFFF" fillOpacity={0.04} />
      <Path d={pulse} stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function AppHeader({ notificationCount }: { notificationCount: number }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  return (
    <View style={styles.headerShadowWrap}>
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1.1, y: 1.6 }}
        style={styles.headerGradient}
      >
        <HeaderPulse width={width} />
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeftColumn}>
              {/* the pill logo doubles as the "i" in iCARE++ */}
              <View style={styles.headerLockup}>
                <Image source={logoImg} style={styles.logo} />
                <Text style={styles.headerTitle}>CARE++</Text>
              </View>
              <Text style={styles.headerTagline}>CLINICAL COMPANION</Text>
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
                <FontAwesome6 name="bell" size={17} color="#FFFFFF" />
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
      </LinearGradient>
    </View>
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

const styles = StyleSheet.create({
  headerShadowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "transparent",
    shadowColor: Teal.deepest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  headerGradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerLeftColumn: {
    flexDirection: "column",
  },
  headerLockup: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    marginLeft: -10,
    marginTop: 10,
    textShadowColor: "rgba(8, 46, 56, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerTagline: {
    fontSize: 8,
    fontWeight: "700",
    color: "#9FC8D2",
    letterSpacing: 2.6,
    marginTop: 2,
    marginLeft: 4,
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
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
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
    borderColor: Teal.deep,
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  tabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
  tabItem: {
    height: 50,
  },
  tabPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  activePill: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 3,
    right: 3,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: Teal.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
});
