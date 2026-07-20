import React, { useRef, useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect, Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Accent, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { API_URL } from '@/lib/client';
import logoImg from '@/assets/images/logo-pill.png';

/** Gradient stops sampled from the pill logo's teal cap. */
const Teal = {
  deepest: '#082E38',
  deep: '#0D4550',
  primary: '#1B6B7B',
  light: '#35859B',
  aqua: '#9FC8D2',
  mist: '#E7F0F1',
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
  ].join(' ');

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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isNetworkIssue, setIsNetworkIssue] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();

  const handleLogin = async () => {
    setError('');
    setIsNetworkIssue(false);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    const result = await login(email, password);
    if (result.ok) {
      router.replace('/(tabs)');
    } else {
      const message = result.error ?? 'Invalid credentials';
      setError(message);
      setIsNetworkIssue(message.toLowerCase().includes('cannot reach'));
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <FontAwesome6
                  name="envelope"
                  size={17}
                  color={focusedField === 'email' ? Teal.primary : Palette.textMuted}
                  style={styles.inputIcon}
                />
                <View style={styles.inputColumn}>
                  <Text
                    style={[styles.inputLabel, focusedField === 'email' && styles.inputLabelFocused]}
                  >
                    Email
                  </Text>
                  <TextInput
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
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <FontAwesome6
                  name="lock"
                  size={17}
                  solid
                  color={focusedField === 'password' ? Teal.primary : Palette.textMuted}
                  style={styles.inputIcon}
                />
                <View style={styles.inputColumn}>
                  <Text
                    style={[
                      styles.inputLabel,
                      focusedField === 'password' && styles.inputLabelFocused,
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
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      style={({ pressed }) => [styles.eyeButton, pressed && { opacity: 0.6 }]}
                    >
                      <FontAwesome6
                        name={showPassword ? 'eye-slash' : 'eye'}
                        size={17}
                        color={Palette.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <FontAwesome6
                    name={isNetworkIssue ? 'wifi' : 'circle-exclamation'}
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
                    <FontAwesome6 name="arrow-right" size={16} solid color="#fff" />
                  </>
                )}
              </Pressable>

              <Pressable style={({ pressed }) => [styles.forgotButton, pressed && { opacity: 0.6 }]}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Pressable>
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

const styles = StyleSheet.create({
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 64,
    overflow: 'hidden',
  },
  appName: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 3,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8, 46, 56, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '700',
    color: Teal.aqua,
    letterSpacing: 3,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -40,
    paddingHorizontal: 28,
    paddingBottom: 32,
    alignItems: 'stretch',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
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
    resizeMode: 'contain',
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: Palette.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 14,
    color: Palette.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 26,
  },
  formSection: {
    gap: Spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Palette.borderLight,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  inputWrapperFocused: {
    borderColor: Teal.primary,
    backgroundColor: '#FFFFFF',
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
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Palette.textMuted,
    textTransform: 'uppercase',
  },
  inputLabelFocused: {
    color: Teal.primary,
  },
  input: {
    fontSize: 16,
    color: '#1E293B',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  eyeButton: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Teal.primary,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    marginTop: Spacing.sm,
    overflow: 'hidden',
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
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  forgotButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    color: Teal.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 32,
  },
  footerText: {
    fontSize: 11,
    color: Palette.textFaint,
    letterSpacing: 0.3,
  },
});
