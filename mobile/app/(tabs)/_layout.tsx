import { Redirect, Tabs, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/lib/roles";
import { AppHeader, FloatingTabBar, type TabIcons } from "@/components/navigation/AppTabs";

const TAB_ICONS: TabIcons = {
  clinic: "hospital",
  demos: "hand-holding-medical",
  quiz: "clipboard-question",
  index: "house",
  library: "book-open",
  profile: "user",
};

// Without this, the tab navigator defaults to whichever Tabs.Screen
// is registered first (Clinic) instead of Home.
export const unstable_settings = { anchor: "index" };

export default function TabLayout() {
  // The badge follows the live feed, so it moves as soon as a notification is
  // written rather than on the next tab switch.
  const { unread: unreadCount } = useNotifications();
  const { Palette } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  // These tabs are the student's. Anyone else is sent to their own home
  // before a student screen mounts and asks a student-only endpoint (403).
  if (user && user.role !== "student") return <Redirect href={homeFor(user.role)} />;

  return (
    <View style={{ flex: 1, backgroundColor: Palette.background }}>
      {/* Profile sits beside the bell, so Home stays the middle tab; Home shows the time. */}
      <AppHeader notificationCount={unreadCount} showClock={false} onProfile={() => router.push("/profile")} />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} icons={TAB_ICONS} hidden={["profile"]} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="clinic" options={{ title: "Clinic" }} />
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="quiz" options={{ title: "Quizzes" }} />
        <Tabs.Screen name="demos" options={{ title: "Demos" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </View>
  );
}
