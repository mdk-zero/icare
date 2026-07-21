import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Rect,
  Circle,
  Path,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { API_URL } from "@/lib/client";
import logoImg from "@/assets/images/logo-pill.png";

// Required once per app so the browser sheet closes itself after the
// provider redirects back into the app.
WebBrowser.maybeCompleteAuthSession();

// Google Cloud Console client IDs — see mobile/.env.example.
//
// Android/iOS client types don't take a manually-registered redirect URI at
// all: Google derives the allowed redirect from the app's real package name
// + the SHA-1 of the build's signing certificate, which only matches when
// running inside an actual build signed with that keystore — NOT inside
// Expo Go (a shared container app with its own package name). So this
// screen only works for Google sign-in from a real dev-client/standalone
// build on Android/iOS; the web client id is what makes it work when
// running on the web platform (`expo start --web`), which uses ordinary
// https redirects.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_SIGN_IN_CONFIGURED = Boolean(
  GOOGLE_WEB_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID,
);

/** Gradient stops sampled from the pill logo's teal cap. */
const Teal = {
  deepest: "#082E38",
  deep: "#0D4550",
  primary: "#1B6B7B",
  light: "#35859B",
  aqua: "#9FC8D2",
  mist: "#E7F0F1",
};

const HERO_HEIGHT = 330;

/** Teal gradient "cap" with a faint ECG trace — the pill's top half. */
function HeroBackdrop({ width }: { width: number }) {
  const midY = 210;
  const pulse = [
    `M0 ${midY}`,
    `L${width * 0.22} ${midY}`,
    `L${width * 0.28} ${midY - 26}`,
    `L${width * 0.34} ${midY + 34}`,
    `L${width * 0.39} ${midY - 8}`,
    `L${width * 0.44} ${midY}`,
    `L${width * 0.62} ${midY}`,
    `L${width * 0.67} ${midY - 18}`,
    `L${width * 0.72} ${midY + 22}`,
    `L${width * 0.76} ${midY}`,
    `L${width} ${midY}`,
  ].join(" ");

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={width} height={HERO_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Teal.light} stopOpacity="0.55" />
            <Stop offset="1" stopColor={Teal.light} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        {/* soft light bloom, like the sheen on the capsule */}
        <Circle cx={width * 0.85} cy={30} r={150} fill="url(#glow)" />
        <Circle cx={width * 0.08} cy={HERO_HEIGHT - 40} r={110} fill="url(#glow)" />
        {/* faint capsule outlines drifting in the background */}
        <Rect
          x={width * 0.68}
          y={58}
          rx={26}
          ry={26}
          width={52}
          height={118}
          stroke="#FFFFFF"
          strokeOpacity={0.08}
          strokeWidth={2}
          fill="none"
          transform={`rotate(28 ${width * 0.68 + 26} ${58 + 59})`}
        />
        <Rect
          x={width * 0.1}
          y={40}
          rx={18}
          ry={18}
          width={36}
          height={84}
          stroke="#FFFFFF"
          strokeOpacity={0.07}
          strokeWidth={2}
          fill="none"
          transform={`rotate(-24 ${width * 0.1 + 18} ${40 + 42})`}
        />
        {/* ECG pulse */}
        <Path d={pulse} stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

/** Gradient fill for the sign-in button. */
function ButtonGradient() {
  return (
    <LinearGradient
      colors={[Teal.light, Teal.primary, Teal.deep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

// Derived from the brand teal so the gradient feels intentional, not a random accent.
const TEAL_DARK = "#0F5D5A";
const TEAL = "#0D9488";
const TEAL_SOFT = "#F0FDFA";
const INK = "#0B1220";
const SLATE = "#64748B";
const SLATE_LIGHT = "#94A3B8";
const FIELD_BG = "#F8FAFC";
const FIELD_BORDER = "#E2E8F0";
const DANGER = "#DC2626";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isNetworkIssue, setIsNetworkIssue] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login, loginWithGoogle, isLoading } = useAuth();
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    // The hook picks androidClientId/iosClientId/webClientId based on the
    // current platform and only falls back to the generic `clientId` prop
    // when that platform-specific one is undefined — so `clientId` needs
    // its own "nothing configured" placeholder, distinct from webClientId,
    // or Android/iOS throw when only the web client id is set.
    clientId:
      GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID || "not-configured",
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  const primaryColor = Colors.light.primary ?? TEAL;

  const handleLogin = async () => {
    setError("");
    setIsNetworkIssue(false);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    const result = await login(email, password, rememberMe);
    if (result.ok) {
      router.replace("/(tabs)");
    } else {
      const message = result.error ?? "Invalid credentials";
      setError(message);
      setIsNetworkIssue(message.toLowerCase().includes("cannot reach"));
    }
  };

  const handleGoogleIdToken = React.useCallback(
    async (idToken: string) => {
      setError("");
      setIsNetworkIssue(false);
      setIsGoogleLoading(true);
      try {
        const result = await loginWithGoogle(idToken, rememberMe);
        if (result.ok) {
          router.replace("/(tabs)");
        } else if (result.needsRoleSelection) {
          setError(
            "This Google account isn't linked to an iCARE++ profile yet. Ask your instructor to set up your account, or finish setup on the web app.",
          );
        } else {
          const message = result.error ?? "Google sign-in failed.";
          setError(message);
          setIsNetworkIssue(message.toLowerCase().includes("cannot reach"));
        }
      } finally {
        setIsGoogleLoading(false);
      }
    },
    [loginWithGoogle, rememberMe, router],
  );

  React.useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === "success") {
      const idToken = googleResponse.params?.id_token ?? googleResponse.authentication?.idToken;
      if (idToken) {
        handleGoogleIdToken(idToken);
      } else {
        setError("Google sign-in did not return a valid credential.");
      }
    } else if (googleResponse.type === "error") {
      setError(googleResponse.error?.message ?? "Google sign-in failed.");
    }
    // 'cancel'/'dismiss': the user backed out — no error to show.
  }, [googleResponse, handleGoogleIdToken]);

  return (
    <View style={styles.container}>
      {/* Ambient background: gradient wash + soft decorative blobs */}
      <LinearGradient colors={[TEAL_SOFT, "#FFFFFF"]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Teal cap — the pill's top half */}
          <View style={styles.hero}>
            <HeroBackdrop width={width} />
            <Text style={styles.appName}>iCARE++</Text>
            <View style={styles.taglineRow}>
              <View style={styles.taglineRule} />
              <Text style={styles.tagline}>CLINICAL COMPETENCY</Text>
              <View style={styles.taglineRule} />
            </View>
          </View>

          {/* White sheet — the pill's bottom half */}
          <View style={styles.sheet}>
            {/* Logo straddles the seam, like the capsule's break line */}
            <View style={styles.logoCircle}>
              <Image source={logoImg} style={styles.logoImage} />
            </View>

            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.subtitleText}>Sign in to continue your rounds</Text>

            <View style={styles.formSection}>
              <Pressable
                onPress={() => emailRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedField === "email" && styles.inputWrapperFocused,
                ]}
              >
                <FontAwesome6
                  name="envelope"
                  size={17}
                  color={focusedField === "email" ? Teal.primary : Palette.textMuted}
                  style={styles.inputIcon}
                />
                <View style={styles.inputColumn}>
                  <Text
                    style={[
                      styles.inputLabel,
                      focusedField === "email" && styles.inputLabelFocused,
                    ]}
                  >
                    Email
                  </Text>
                  <TextInput
                    ref={emailRef}
                    style={styles.input}
                    placeholder="email@example.com"
                    placeholderTextColor={Palette.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    editable={!isLoading}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </Pressable>

              <Pressable
                onPress={() => passwordRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedField === "password" && styles.inputWrapperFocused,
                ]}
              >
                <FontAwesome6
                  name="lock"
                  size={17}
                  solid
                  color={focusedField === "password" ? Teal.primary : Palette.textMuted}
                  style={styles.inputIcon}
                />
                <View style={styles.inputColumn}>
                  <Text
                    style={[
                      styles.inputLabel,
                      focusedField === "password" && styles.inputLabelFocused,
                    ]}
                  >
                    Password
                  </Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      ref={passwordRef}
                      style={[styles.input, styles.passwordInput]}
                      placeholder="••••••••"
                      placeholderTextColor={Palette.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="go"
                      editable={!isLoading}
                      onSubmitEditing={handleLogin}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      style={({ pressed }) => [styles.eyeButton, pressed && { opacity: 0.6 }]}
                    >
                      <FontAwesome6
                        name={showPassword ? "eye-slash" : "eye"}
                        size={17}
                        color={Palette.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              </Pressable>

              <View style={styles.optionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.rememberMeRow, pressed && { opacity: 0.7 }]}
                  onPress={() => setRememberMe((v) => !v)}
                  hitSlop={8}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <FontAwesome6 name="check" size={10} solid color="#FFFFFF" />}
                  </View>
                  <Text style={styles.rememberMeText}>Remember me</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                  onPress={() => router.push("/forgot-password")}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <FontAwesome6
                    name={isNetworkIssue ? "wifi" : "circle-exclamation"}
                    size={16}
                    solid
                    color={Accent.red.fg}
                  />
                  <View style={styles.errorTextColumn}>
                    <Text style={styles.errorText}>{error}</Text>
                    {isNetworkIssue && (
                      <Text style={styles.errorHint}>
                        Tried {API_URL} — make sure the iCARE++ web server is running. On a physical
                        device, set EXPO_PUBLIC_API_URL to your computer&apos;s LAN IP.
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (pressed || isLoading) && styles.buttonPressed,
                ]}
                onPress={handleLogin}
                disabled={isLoading}
                style={styles.buttonShadow}
              >
                <ButtonGradient />
                {isLoading ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.buttonText}>Signing in…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.buttonText}>Sign In</Text>
                  </>
                )}
              </Pressable>

              {GOOGLE_SIGN_IN_CONFIGURED && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.googleButton,
                      (pressed || isLoading || isGoogleLoading) && styles.buttonPressed,
                    ]}
                    onPress={() => promptGoogleSignIn()}
                    disabled={!googleRequest || isLoading || isGoogleLoading}
                  >
                    {isGoogleLoading ? (
                      <ActivityIndicator size="small" color={Teal.primary} />
                    ) : (
                      <>
                        <FontAwesome6 name="google" size={16} color={Teal.primary} />
                        <Text style={styles.googleButtonText}>Sign in with Google</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.footer}>
              <FontAwesome6 name="shield-halved" size={12} solid color={Palette.textFaint} />
              <Text style={styles.footerText}>
                Protected by Philippine Data Privacy Act of 2012
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const LOGO_SIZE = 96;

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Accent: ReturnType<typeof useTheme>["Accent"],
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Teal.deepest,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    hero: {
      height: HERO_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 64,
      overflow: "hidden",
    },
    appName: {
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: 3,
      color: "#FFFFFF",
      textShadowColor: "rgba(8, 46, 56, 0.45)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    taglineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      marginTop: Spacing.md,
    },
    taglineRule: {
      width: 28,
      height: 1,
      backgroundColor: Teal.aqua,
      opacity: 0.5,
    },
    tagline: {
      fontSize: 11,
      fontWeight: "700",
      color: Teal.aqua,
      letterSpacing: 3,
    },
    sheet: {
      flex: 1,
      backgroundColor: Palette.surface,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      marginTop: -40,
      paddingHorizontal: 28,
      paddingBottom: 32,
      alignItems: "stretch",
      shadowColor: Teal.deepest,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 12,
    },
    logoCircle: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: LOGO_SIZE / 2,
      backgroundColor: Palette.surface,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginTop: -(LOGO_SIZE / 2),
      marginBottom: 18,
      borderWidth: 4,
      borderColor: Teal.mist,
      shadowColor: Teal.deepest,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 8,
    },
    logoImage: {
      width: 66,
      height: 66,
      resizeMode: "contain",
    },
    welcomeText: {
      fontSize: 26,
      fontWeight: "800",
      color: Palette.ink,
      letterSpacing: -0.5,
      textAlign: "center",
    },
    subtitleText: {
      fontSize: 14,
      color: Palette.textSecondary,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 26,
    },
    formSection: {
      gap: Spacing.lg,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Palette.surfaceMuted,
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      borderColor: Palette.borderLight,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 10,
    },
    inputWrapperFocused: {
      borderColor: Teal.primary,
      backgroundColor: Palette.surface,
      shadowColor: Teal.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 2,
    },
    inputIcon: {
      marginRight: Spacing.md,
    },
    inputColumn: {
      flex: 1,
    },
    inputLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: Palette.textMuted,
      textTransform: "uppercase",
    },
    inputLabelFocused: {
      color: Teal.primary,
    },
    input: {
      fontSize: 16,
      color: Palette.ink,
      paddingVertical: 4,
      paddingHorizontal: 0,
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    passwordInput: {
      flex: 1,
      marginRight: Spacing.sm,
    },
    eyeButton: {
      padding: 4,
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.sm,
      backgroundColor: Accent.red.bg,
      borderWidth: 1,
      borderColor: Accent.red.border,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    errorTextColumn: {
      flex: 1,
    },
    errorText: {
      color: Accent.red.fg,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    errorHint: {
      color: Accent.red.fg,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
      opacity: 0.85,
    },
    button: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: Spacing.sm,
      backgroundColor: Teal.primary,
      borderRadius: Radius.lg,
      paddingVertical: 17,
      marginTop: Spacing.sm,
      overflow: "hidden",
      shadowColor: Teal.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonText: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    optionsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: -Spacing.sm,
    },
    rememberMeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: Palette.textFaint,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: Teal.primary,
      borderColor: Teal.primary,
    },
    rememberMeText: {
      fontSize: 13.5,
      fontWeight: "500",
      color: Palette.textSecondary,
    },
    forgotText: {
      fontSize: 14,
      fontWeight: "600",
      color: Teal.primary,
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      marginTop: Spacing.sm,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: Palette.borderLight,
    },
    dividerText: {
      fontSize: 12,
      fontWeight: "600",
      color: Palette.textMuted,
      letterSpacing: 0.2,
    },
    googleButton: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: Spacing.sm,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      borderColor: Palette.borderLight,
      paddingVertical: 15,
    },
    googleButtonText: {
      color: Palette.ink,
      fontSize: 15,
      fontWeight: "700",
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: "auto",
      marginBottom: 12,
      paddingTop: 32,
    },
    footerText: {
      fontSize: 11,
      color: Palette.textFaint,
      letterSpacing: 0.3,
    },
  });
}
