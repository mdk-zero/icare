import React, { useMemo } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarImage } from "@/hooks/useAvatar";
import { ThemePreference, useThemePreference } from "@/hooks/useThemePreference";
import { SectionHeader } from "@/components/ui";
import { API_URL } from "@/lib/client";
import { roleLabel } from "@/lib/roles";

const Teal = { deepest: "#082E38", deep: "#0D4550", primary: "#1B6B7B", light: "#35859B" };

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "system", label: "System", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
];

function initials(name?: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "I";
  return ((words[0][0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** The instructor's account, settings, and the way to the web portal for grading. */
export default function InstructorMeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const { source: avatarSource } = useAvatarImage(user);

  const links = [
    {
      label: "Account",
      detail: "Name, details, and password",
      icon: "person-circle-outline" as const,
      accent: Accent.teal,
      onPress: () => router.push("/account"),
    },
    {
      label: "Notifications",
      detail: "Course assignments and alerts",
      icon: "notifications-outline" as const,
      accent: Accent.amber,
      onPress: () => router.push("/notifications"),
    },
    {
      label: "Open the web portal",
      detail: "Grade Patient Cases and edit checklists",
      icon: "open-outline" as const,
      accent: Accent.blue,
      onPress: () => void Linking.openURL(`${API_URL}/faculty/courses`),
    },
  ];

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}>
      <LinearGradient colors={[Teal.deepest, Teal.deep, Teal.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerCard}>
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials(user?.name)}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name ?? "Instructor"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        <View style={styles.badge}>
          <Ionicons name="school-outline" size={12} color="#FFFFFF" />
          <Text style={styles.badgeText}>{roleLabel(user?.role)}</Text>
        </View>
      </LinearGradient>

      <SectionHeader title="Settings" />
      <View style={styles.listCard}>
        {links.map((link, i) => (
          <Pressable
            key={link.label}
            onPress={link.onPress}
            style={({ pressed }) => [styles.linkItem, i > 0 && styles.rowBorder, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.iconBox, { backgroundColor: link.accent.bg }]}>
              <Ionicons name={link.icon} size={17} color={link.accent.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkText}>{link.label}</Text>
              <Text style={styles.linkDetail}>{link.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
          </Pressable>
        ))}
        <View style={[styles.settingBlock, styles.rowBorder]}>
          <Text style={styles.linkText}>Appearance</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = preference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPreference(opt.value)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Ionicons name={opt.icon} size={14} color={active ? Palette.primary : Palette.textSecondary} />
                  <Text style={[styles.segmentText, active && { color: Palette.primary }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Pressable onPress={handleLogout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
        <Ionicons name="log-out-outline" size={19} color={Accent.red.fg} />
        <Text style={[styles.logoutText, { color: Accent.red.fg }]}>Logout</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Shadow: ReturnType<typeof useTheme>["Shadow"],
  Type: ReturnType<typeof useTheme>["Type"],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 128 },
    headerCard: { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: "center", marginBottom: Spacing.xxl, ...Shadow.raised },
    avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: "#FFFFFF88", marginBottom: Spacing.lg },
    avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF26" },
    avatarText: { fontSize: 24, fontWeight: "700", color: "#fff" },
    name: { ...Type.screenTitle, fontSize: 22, color: "#FFFFFF" },
    email: { fontSize: 13, color: "#E7F0F1CC", marginTop: 2 },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: Spacing.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: 5,
      borderRadius: Radius.pill,
      backgroundColor: "#FFFFFF26",
      borderWidth: 1,
      borderColor: "#FFFFFF33",
    },
    badgeText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
    listCard: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      marginBottom: Spacing.xxl,
      ...Shadow.card,
    },
    linkItem: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: Palette.borderLight },
    iconBox: { width: 34, height: 34, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
    linkText: { fontSize: 15, fontWeight: "600", color: Palette.ink },
    linkDetail: { fontSize: 12, color: Palette.textSecondary, marginTop: 1 },
    settingBlock: { padding: Spacing.md, gap: Spacing.md },
    segment: { flexDirection: "row", backgroundColor: Palette.surfaceMuted, borderRadius: Radius.md, padding: 3 },
    segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: Radius.sm },
    segmentItemActive: { backgroundColor: Palette.surface },
    segmentText: { fontSize: 13, fontWeight: "600", color: Palette.textSecondary },
    logout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
    },
    logoutText: { fontSize: 15, fontWeight: "700" },
  });
}
