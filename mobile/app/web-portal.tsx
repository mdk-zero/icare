import React, { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { PrimaryButton } from "@/components/ui";
import { API_URL } from "@/lib/client";
import { roleLabel } from "@/lib/roles";

/**
 * Deans and Admins manage the school on the web portal; the app has no
 * screens for them, so it says so instead of opening student or instructor
 * screens they cannot use.
 */
export default function WebPortalScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const role = roleLabel(user?.role);
  const portal = user?.role === "super_admin" ? `${API_URL}/super-admin` : `${API_URL}/admin`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: Accent.teal.bg }]}>
          <Ionicons name="desktop-outline" size={34} color={Accent.teal.fg} />
        </View>
        <Text style={[Type.screenTitle, { textAlign: "center" }]}>Use the web portal</Text>
        <Text style={styles.text}>
          {`Hi ${user?.name?.split(/\s+/)[0] ?? "there"}. The ${role} tools — courses, instructors, students and reports — are on the iCARE++ web portal. This app is for students and instructors.`}
        </Text>
        <PrimaryButton title="Open the web portal" onPress={() => void Linking.openURL(portal)} style={{ alignSelf: "stretch" }} />
        <PrimaryButton
          title="Sign out"
          variant="outline"
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
          style={{ alignSelf: "stretch" }}
        />
      </View>
    </SafeAreaView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    body: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xxl, gap: Spacing.lg },
    icon: { width: 72, height: 72, borderRadius: Radius.xl, alignItems: "center", justifyContent: "center" },
    text: { fontSize: 15, lineHeight: 22, color: Palette.textSecondary, textAlign: "center" },
  });
}
