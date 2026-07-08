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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { API_URL } from '@/lib/client';
import logoImg from '@/assets/images/logo-pill.png';

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
        >
          <View style={styles.headerSection}>
            <View style={styles.logoCircle}>
              <Image source={logoImg} style={styles.logoImage} />
            </View>
            <Text style={styles.appName}>iCARE++</Text>
            <Text style={styles.tagline}>Clinical Competency Assessment</Text>
          </View>

          <View style={styles.contentSection}>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.subtitleText}>Sign in to continue</Text>

            <View style={styles.formSection}>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <Text style={[styles.inputLabel, focusedField === 'email' && styles.inputLabelFocused]}>
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

              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <Text style={[styles.inputLabel, focusedField === 'password' && styles.inputLabelFocused]}>
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
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Palette.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons
                    name={isNetworkIssue ? 'cloud-offline-outline' : 'alert-circle-outline'}
                    size={18}
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
                {isLoading ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.buttonText}>Signing in…</Text>
                  </>
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>

              <Pressable style={({ pressed }) => [styles.forgotButton, pressed && { opacity: 0.6 }]}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Protected by Philippine Data Privacy Act of 2012
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 72,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  logoImage: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
    color: Palette.primary,
  },
  tagline: {
    fontSize: 12,
    color: Palette.textMuted,
    letterSpacing: 0.5,
  },
  contentSection: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 30,
    fontWeight: '800',
    color: Palette.ink,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 15,
    color: Palette.textSecondary,
    marginBottom: 28,
  },
  formSection: {
    gap: Spacing.lg,
  },
  inputWrapper: {
    borderBottomWidth: 2,
    borderBottomColor: Palette.border,
    paddingBottom: 6,
  },
  inputWrapperFocused: {
    borderBottomColor: Palette.primary,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
    color: Palette.textMuted,
    textTransform: 'uppercase',
  },
  inputLabelFocused: {
    color: Palette.primary,
  },
  input: {
    fontSize: 17,
    color: '#1E293B',
    paddingVertical: 8,
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
    backgroundColor: Palette.primary,
    borderRadius: Radius.md,
    paddingVertical: 17,
    marginTop: Spacing.sm,
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
    paddingVertical: Spacing.md,
  },
  forgotText: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.primary,
  },
  footer: {
    alignItems: 'center',
    marginTop: 44,
  },
  footerText: {
    fontSize: 11,
    color: Palette.textFaint,
    letterSpacing: 0.3,
  },
});
