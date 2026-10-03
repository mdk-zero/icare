import { Redirect, Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/lib/roles";
import { AppHeader, FloatingTabBar, type TabIcons } from "@/components/navigation/AppTabs";

const TAB_ICONS: TabIcons = {
  courses: "book-medical",
  students: "user-group",
  me: "user",
};

/**
 * The instructor's app: their courses and requirement checklists, their
 * students' progress, and their account. Grading stays on the web portal.
 * There is no index route here: the student tabs' Home owns "/".
 */
export default function InstructorLayout() {
  const { unread } = useNotifications();
  const { Palette } = useTheme();
  const { user } = useAuth();

  if (user && user.role !== "faculty") return <Redirect href={homeFor(user.role)} />;

  return (
    <View style={{ flex: 1, backgroundColor: Palette.background }}>
      <AppHeader notificationCount={unread} tagline="INSTRUCTOR" />
      <Tabs
        initialRouteName="courses"
        tabBar={(props) => <FloatingTabBar {...props} icons={TAB_ICONS} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="courses" options={{ title: "Courses" }} />
        <Tabs.Screen name="students" options={{ title: "Students" }} />
        <Tabs.Screen name="me" options={{ title: "Me" }} />
      </Tabs>
    </View>
  );
}
