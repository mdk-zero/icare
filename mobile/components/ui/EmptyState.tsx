import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  tone?: "muted" | "success";
}

export function EmptyState({
  icon = "file-tray-outline",
  message,
  tone = "muted",
}: EmptyStateProps) {
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const color = tone === "success" ? Accent.green.fg : Palette.textFaint;
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={color} />
      <Text style={[styles.text, tone === "success" && styles.textSuccess]}>{message}</Text>
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Accent: ReturnType<typeof useTheme>["Accent"],
) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      paddingVertical: Spacing.xxl,
    },
    text: {
      fontSize: 14,
      color: Palette.textMuted,
      marginTop: Spacing.sm,
      textAlign: "center",
    },
    textSuccess: {
      color: Accent.green.fg,
      fontWeight: "600",
    },
  });
}
