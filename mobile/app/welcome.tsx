import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome6 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import PermissionSwitches from "@/components/PermissionSwitches";
import { markOnboarded } from "@/lib/permissions";
import { openPrivacy, openTerms } from "@/lib/legal";
import logoImg from "@/assets/images/logo-pill.png";

/** The boot screen's and login hero's teal ramp, so first launch flows into sign-in. */
const Teal = {
  deepest: "#082E38",
  deep: "#0D4550",
  primary: "#1B6B7B",
  light: "#35859B",
  aqua: "#9FC8D2",
};

const LOGO = 112;

/**
 * First launch, before the first sign-in: the logo and what iCARE++ is,
 * then agreeing to the Terms of Use and Privacy Policy. Continue (only once
 * agreed) floats up a sheet with switches for notifications and the camera, and
 * from there goes to sign-in. The screen isn't shown again.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { Palette } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette), [Palette]);
  const reduceMotion = useReducedMotion();

  const [agreed, setAgreed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const leaving = useRef(false);

  // The sheet starts below the screen and springs up; the backdrop dims with it.
  const sheetY = useSharedValue(height);
  const backdrop = useSharedValue(0);

  const openSheet = () => {
    if (!agreed) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetOpen(true);
    if (reduceMotion) {
      sheetY.set(withTiming(0, { duration: 150 }));
      backdrop.set(withTiming(1, { duration: 150 }));
      return;
    }
    sheetY.set(withSpring(0, { damping: 20, stiffness: 170, mass: 0.9 }));
    backdrop.set(withTiming(1, { duration: 260 }));
  };

  const closeSheet = useCallback(() => {
    // Leaving is quicker than arriving.
    backdrop.set(withTiming(0, { duration: 180 }));
    sheetY.set(
      withTiming(height, { duration: reduceMotion ? 120 : 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setSheetOpen)(false);
      }),
    );
  }, [backdrop, sheetY, height, reduceMotion]);

  // Android's back button closes the sheet before it leaves the screen.
  useEffect(() => {
    if (!sheetOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [sheetOpen, closeSheet]);

  const goToSignIn = async () => {
    if (leaving.current) return;
    leaving.current = true;
    await markOnboarded();
    router.replace("/login");
  };

  const toggleAgreed = () => {
    void Haptics.selectionAsync();
    setAgreed((v) => !v);
  };

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.hero}>
          <View style={styles.logoDisc}>
            <Image source={logoImg} style={styles.logo} accessibilityIgnoresInvertColors />
          </View>
          <Text style={styles.appName} accessibilityRole="header">
            iCARE++
          </Text>
          <Text style={styles.tagline}>Clinical practice that keeps pace with you.</Text>
        </View>

        <View>
          <Pressable
            onPress={toggleAgreed}
            style={styles.agreeRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I agree to the Terms of Use and acknowledge I have read the Privacy Policy"
            hitSlop={8}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed && <FontAwesome6 name="check" size={12} solid color={Teal.deep} />}
            </View>
            <Text style={styles.agreeText}>
              I agree to the{" "}
              <Text style={styles.agreeLink} onPress={openTerms} accessibilityRole="link">
                Terms of Use
              </Text>{" "}
              and acknowledge I have read the{" "}
              <Text style={styles.agreeLink} onPress={openPrivacy} accessibilityRole="link">
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>

          <Pressable
            onPress={openSheet}
            disabled={!agreed}
            style={({ pressed }) => [styles.startButton, !agreed && styles.startDisabled, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !agreed }}
          >
            <Text style={styles.startText}>Continue</Text>
          </Pressable>
        </View>
      </View>

      {sheetOpen && (
        <>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeSheet}
              accessibilityLabel="Close"
              accessibilityRole="button"
            />
          </Animated.View>
          <Animated.View
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.xl }, sheetStyle]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Notifications and camera
            </Text>
            <Text style={styles.sheetLede}>
              Turn on what you want iCARE++ to use. You can change these anytime in Profile, under Settings.
            </Text>

            <PermissionSwitches />

            <Pressable
              onPress={goToSignIn}
              style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[Teal.light, Teal.primary, Teal.deep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.continueText}>Continue to sign in</Text>
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"]) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Teal.deepest,
    },
    content: {
      flex: 1,
      justifyContent: "space-between",
      paddingHorizontal: 28,
    },
    hero: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    logoDisc: {
      width: LOGO,
      height: LOGO,
      borderRadius: LOGO / 2,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 10,
    },
    logo: {
      width: 74,
      height: 74,
      resizeMode: "contain",
    },
    appName: {
      marginTop: 28,
      fontSize: 40,
      fontWeight: "900",
      letterSpacing: 1,
      color: "#FFFFFF",
    },
    tagline: {
      marginTop: Spacing.md,
      fontSize: 17,
      lineHeight: 24,
      color: Teal.aqua,
      textAlign: "center",
      maxWidth: 260,
    },
    agreeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      marginBottom: Spacing.xl,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: Teal.aqua,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: {
      backgroundColor: "#FFFFFF",
      borderColor: "#FFFFFF",
    },
    agreeText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: "#E7F0F1",
    },
    agreeLink: {
      fontWeight: "700",
      color: "#FFFFFF",
      textDecorationLine: "underline",
    },
    startButton: {
      backgroundColor: "#FFFFFF",
      borderRadius: Radius.lg,
      paddingVertical: 17,
      alignItems: "center",
    },
    startDisabled: {
      opacity: 0.45,
    },
    startText: {
      fontSize: 16,
      fontWeight: "800",
      color: Teal.deep,
    },
    pressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(4, 24, 30, 0.55)",
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: Palette.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: Spacing.md,
      shadowColor: Teal.deepest,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 16,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Palette.border,
      marginBottom: Spacing.xl,
    },
    sheetTitle: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.4,
      color: Palette.ink,
    },
    sheetLede: {
      fontSize: 14,
      lineHeight: 20,
      color: Palette.textSecondary,
      marginTop: Spacing.xs,
      marginBottom: Spacing.md,
    },
    continueButton: {
      marginTop: Spacing.xl,
      borderRadius: Radius.lg,
      paddingVertical: 17,
      alignItems: "center",
      overflow: "hidden",
    },
    continueText: {
      fontSize: 16,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}
