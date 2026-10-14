import React, { useEffect, useMemo, useState } from "react";
import { Alert, AppState, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { getToken } from "@/lib/client";
import { registerForPush, unregisterFromPush } from "@/lib/push";
import {
  notificationPermission,
  notificationsAvailable,
  notificationsOn,
  openSettings,
  cameraPermission,
  requestNotificationPermission,
  requestCameraPermission,
  setNotificationsOn,
  type PermissionState,
} from "@/lib/permissions";

interface SwitchState {
  /** null while reading. */
  notifications: boolean | null;
  camera: boolean | null;
}

function askForSettings(what: string, turningOn: boolean) {
  Alert.alert(
    turningOn ? `Turn on ${what} in Settings` : `Turn off ${what} in Settings`,
    turningOn
      ? `${what[0].toUpperCase()}${what.slice(1)} access is turned off for iCARE++ in your phone's Settings. Turn it on there to use it.`
      : `Your phone only lets you take away ${what} access in its Settings.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: openSettings },
    ],
  );
}

/**
 * The notifications and camera switches, as the welcome sheet and Settings
 * in Profile show them. A switch reads the phone's permission (and, for
 * notifications, the user's own on/off), asks the phone when turned on, and
 * sends the user to Settings where only the phone can make the change.
 */
export default function PermissionSwitches({ inset = 0 }: { inset?: number }) {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette, inset), [Palette, inset]);
  const [state, setState] = useState<SwitchState>({ notifications: null, camera: null });
  const [busy, setBusy] = useState<"notifications" | "camera" | null>(null);
  const canNotify = notificationsAvailable();

  useEffect(() => {
    const read = () =>
      Promise.all([notificationPermission(), notificationsOn(), cameraPermission()]).then(([n, on, c]) =>
        setState({ notifications: n === "granted" && on, camera: c === "granted" }),
      );
    void read();
    // Coming back from the phone's Settings may have changed one.
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") void read();
    });
    return () => sub.remove();
  }, []);

  const toggleNotifications = async (on: boolean) => {
    setBusy("notifications");
    try {
      if (!on) {
        await setNotificationsOn(false);
        setState((s) => ({ ...s, notifications: false }));
        // Signed in: stop pushes to this phone too.
        if (await getToken()) await unregisterFromPush();
        return;
      }
      let permission: PermissionState = await notificationPermission();
      if (permission === "undetermined") permission = await requestNotificationPermission();
      if (permission === "denied") {
        askForSettings("notifications", true);
        return;
      }
      if (permission !== "granted") return;
      await setNotificationsOn(true);
      setState((s) => ({ ...s, notifications: true }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (await getToken()) await registerForPush();
    } finally {
      setBusy(null);
    }
  };

  const toggleCamera = async (on: boolean) => {
    if (!on) {
      askForSettings("camera", false);
      return;
    }
    setBusy("camera");
    try {
      let permission: PermissionState = await cameraPermission();
      if (permission === "undetermined") permission = await requestCameraPermission();
      if (permission === "denied") {
        askForSettings("camera", true);
        return;
      }
      setState((s) => ({ ...s, camera: permission === "granted" }));
      if (permission === "granted") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setBusy(null);
    }
  };

  const track = { false: Palette.border, true: Palette.primary };

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: Accent.amber.bg }]}>
          <Ionicons name="notifications-outline" size={18} color={Accent.amber.fg} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.detail}>
            {canNotify
              ? "Know the moment a grade, a new case or an instructor's message comes in."
              : "Needs the installed app; not available in Expo Go."}
          </Text>
        </View>
        <Switch
          value={!!state.notifications}
          onValueChange={(on) => void toggleNotifications(on)}
          disabled={!canNotify || state.notifications === null || busy !== null}
          trackColor={track}
          thumbColor="#FFFFFF"
          ios_backgroundColor={Palette.border}
          accessibilityLabel="Notifications"
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: Accent.teal.bg }]}>
          <Ionicons name="camera-outline" size={18} color={Accent.teal.fg} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Camera</Text>
          <Text style={styles.detail}>Take a profile picture. Choosing one from your gallery needs no permission.</Text>
        </View>
        <Switch
          value={!!state.camera}
          onValueChange={(on) => void toggleCamera(on)}
          disabled={state.camera === null || busy !== null}
          trackColor={track}
          thumbColor="#FFFFFF"
          ios_backgroundColor={Palette.border}
          accessibilityLabel="Camera"
        />
      </View>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"], inset: number) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: inset,
      minHeight: 64,
    },
    icon: {
      width: 38,
      height: 38,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    text: {
      flex: 1,
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: Palette.ink,
    },
    detail: {
      fontSize: 12,
      lineHeight: 17,
      color: Palette.textSecondary,
      marginTop: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Palette.border,
      marginLeft: inset + 38 + Spacing.md,
    },
  });
}
