import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

/** Gradient stops per accent, sampled darker→lighter for the header icon tile.
 * Fixed decorative gradient — stays constant across schemes, not theme-driven. */
const ACCENT_GRADIENTS: Record<keyof ReturnType<typeof useTheme>["Accent"], [string, string]> = {
  red: ["#DC2626", "#F87171"],
  amber: ["#D97706", "#FBBF24"],
  green: ["#16A34A", "#4ADE80"],
  blue: ["#2563EB", "#60A5FA"],
  violet: ["#7C3AED", "#A78BFA"],
  cyan: ["#0891B2", "#22D3EE"],
  slate: ["#475569", "#94A3B8"],
  teal: ["#0D4550", "#35859B"],
};

interface ScreenHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: keyof ReturnType<typeof useTheme>["Accent"];
  right?: React.ReactNode;
}

/**
 * Lightweight page header rendered directly on the canvas (no card),
 * so screens lead with content instead of stacked white boxes.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  accent = "teal",
  right,
}: ScreenHeaderProps) {
  const { Palette, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Type), [Palette, Type]);
  const gradient = ACCENT_GRADIENTS[accent];
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (icon ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconTile}
          >
            <Ionicons name={icon} size={22} color="#FFFFFF" />
          </LinearGradient>
        ) : null)}
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Type: ReturnType<typeof useTheme>["Type"],
) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    textColumn: {
      flex: 1,
      marginRight: Spacing.md,
    },
    eyebrow: {
      ...Type.eyebrow,
      marginBottom: Spacing.xs,
    },
    title: Type.screenTitle,
    subtitle: {
      ...Type.caption,
      fontSize: 13,
      marginTop: Spacing.xs,
    },
    iconTile: {
      width: 46,
      height: 46,
      borderRadius: Radius.md + 2,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: Palette.ink,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 3,
    },
  });
}
