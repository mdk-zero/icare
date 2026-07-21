import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/lib/client';
import { requestPasswordReset, checkPasswordResetCode, resetPassword } from '@/lib/api';

/** Gradient stops sampled from the pill logo's teal cap (same as the login screen). */
const Teal = {
  deepest: '#082E38',
  deep: '#0D4550',
  primary: '#1B6B7B',
  light: '#35859B',
};

type Step = 'email' | 'code' | 'reset' | 'success';

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  email: { title: 'Reset your password', subtitle: "Enter your email and we'll send you a reset code." },
  code: { title: 'Check your inbox', subtitle: 'Enter the 6-digit code sent to your email.' },
  reset: { title: 'Choose a new password', subtitle: 'Pick something you’ll remember.' },
  success: { title: 'Password updated', subtitle: 'You can now sign in with your new password.' },
};

/** Gradient fill shared with the login screen's primary button. */
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const otpRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const handleRequestCode = async () => {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message ?? 'If this account exists, a reset code has been sent.');
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError && err.message === 'google_no_password') {
        setError('This account uses Google sign-in and has no password set. Please sign in with Google on the web instead.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to send reset code.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setIsLoading(true);
    try {
      await checkPasswordResetCode(email.trim(), otp.trim());
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired reset code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(email.trim(), otp.trim(), newPassword);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const copy = STEP_COPY[step];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={[Teal.deepest, Teal.deep, Teal.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
              onPress={() => router.back()}
              hitSlop={10}
            >
              <FontAwesome6 name="arrow-left" size={16} solid color="#FFFFFF" />
            </Pressable>
            <View style={styles.heroIcon}>
              <FontAwesome6 name="key" size={26} solid color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>{copy.title}</Text>
            <Text style={styles.heroSubtitle}>{copy.subtitle}</Text>
          </LinearGradient>

          <View style={styles.sheet}>
            {error ? (
              <View style={styles.errorBanner}>
                <FontAwesome6 name="circle-exclamation" size={16} solid color={Accent.red.fg} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {message && step === 'code' ? (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>{message}</Text>
              </View>
            ) : null}

            {step === 'email' && (
              <View style={styles.formSection}>
                <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
                  <FontAwesome6
                    name="envelope"
                    size={17}
                    color={focusedField === 'email' ? Teal.primary : Palette.textMuted}
                    style={styles.inputIcon}
                  />
                  <View style={styles.inputColumn}>
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
                      returnKeyType="go"
                      editable={!isLoading}
                      onSubmitEditing={handleRequestCode}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.button, (pressed || isLoading) && styles.buttonPressed]}
                  onPress={handleRequestCode}
                  disabled={isLoading}
                >
                  <ButtonGradient />
                  {isLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.buttonText}>Sending code…</Text>
                    </>
                  ) : (
                    <Text style={styles.buttonText}>Send reset code</Text>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'code' && (
              <View style={styles.formSection}>
                <View style={[styles.inputWrapper, focusedField === 'otp' && styles.inputWrapperFocused]}>
                  <FontAwesome6
                    name="shield-halved"
                    size={17}
                    solid
                    color={focusedField === 'otp' ? Teal.primary : Palette.textMuted}
                    style={styles.inputIcon}
                  />
                  <View style={styles.inputColumn}>
                    <Text style={[styles.inputLabel, focusedField === 'otp' && styles.inputLabelFocused]}>
                      Reset Code
                    </Text>
                    <TextInput
                      ref={otpRef}
                      style={[styles.input, styles.otpInput]}
                      placeholder="000000"
                      placeholderTextColor={Palette.textMuted}
                      value={otp}
                      onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      returnKeyType="go"
                      editable={!isLoading}
                      onSubmitEditing={handleVerifyCode}
                      onFocus={() => setFocusedField('otp')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || isLoading || otp.length < 6) && styles.buttonPressed,
                  ]}
                  onPress={handleVerifyCode}
                  disabled={isLoading || otp.length < 6}
                >
                  <ButtonGradient />
                  {isLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.buttonText}>Verifying…</Text>
                    </>
                  ) : (
                    <Text style={styles.buttonText}>Verify code</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.resendButton, pressed && { opacity: 0.6 }]}
                  onPress={handleRequestCode}
                  disabled={isLoading}
                >
                  <Text style={styles.resendText}>Didn&apos;t get a code? Resend</Text>
                </Pressable>
              </View>
            )}

            {step === 'reset' && (
              <View style={styles.formSection}>
                <View
                  style={[styles.inputWrapper, focusedField === 'newPassword' && styles.inputWrapperFocused]}
                >
                  <FontAwesome6
                    name="lock"
                    size={17}
                    solid
                    color={focusedField === 'newPassword' ? Teal.primary : Palette.textMuted}
                    style={styles.inputIcon}
                  />
                  <View style={styles.inputColumn}>
                    <Text
                      style={[styles.inputLabel, focusedField === 'newPassword' && styles.inputLabelFocused]}
                    >
                      New Password
                    </Text>
                    <View style={styles.passwordRow}>
                      <TextInput
                        ref={newPasswordRef}
                        style={[styles.input, styles.passwordInput]}
                        placeholder="At least 8 characters"
                        placeholderTextColor={Palette.textMuted}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showPassword}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        returnKeyType="next"
                        editable={!isLoading}
                        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                        onFocus={() => setFocusedField('newPassword')}
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

                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'confirmPassword' && styles.inputWrapperFocused,
                  ]}
                >
                  <FontAwesome6
                    name="lock"
                    size={17}
                    solid
                    color={focusedField === 'confirmPassword' ? Teal.primary : Palette.textMuted}
                    style={styles.inputIcon}
                  />
                  <View style={styles.inputColumn}>
                    <Text
                      style={[
                        styles.inputLabel,
                        focusedField === 'confirmPassword' && styles.inputLabelFocused,
                      ]}
                    >
                      Confirm Password
                    </Text>
                    <TextInput
                      ref={confirmPasswordRef}
                      style={styles.input}
                      placeholder="Re-enter your password"
                      placeholderTextColor={Palette.textMuted}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="go"
                      editable={!isLoading}
                      onSubmitEditing={handleResetPassword}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.button, (pressed || isLoading) && styles.buttonPressed]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                >
                  <ButtonGradient />
                  {isLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.buttonText}>Resetting…</Text>
                    </>
                  ) : (
                    <Text style={styles.buttonText}>Reset password</Text>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'success' && (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <FontAwesome6 name="check" size={22} solid color={Accent.green.fg} />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={() => router.replace('/login')}
                >
                  <ButtonGradient />
                  <Text style={styles.buttonText}>Go to sign in</Text>
                </Pressable>
              </View>
            )}

            {step !== 'success' && step !== 'reset' && (
              <Pressable
                style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.6 }]}
                onPress={() => router.back()}
              >
                <Text style={styles.backLinkText}>Back to sign in</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Accent: ReturnType<typeof useTheme>['Accent']) {
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
      paddingTop: 64,
      paddingBottom: 44,
      paddingHorizontal: 28,
      alignItems: 'center',
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32,
    },
    backButton: {
      position: 'absolute',
      top: 60,
      left: 24,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    heroSubtitle: {
      fontSize: 13.5,
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 19,
      paddingHorizontal: Spacing.md,
    },
    sheet: {
      flex: 1,
      backgroundColor: Palette.surface,
      paddingHorizontal: 28,
      paddingTop: 28,
      paddingBottom: 32,
    },
    formSection: {
      gap: Spacing.lg,
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
      marginBottom: Spacing.lg,
    },
    errorText: {
      flex: 1,
      color: Accent.red.fg,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    infoBanner: {
      backgroundColor: Accent.teal.bg,
      borderWidth: 1,
      borderColor: Accent.teal.border,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    infoText: {
      color: Accent.teal.fg,
      fontSize: 13,
      lineHeight: 18,
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
      backgroundColor: Palette.surface,
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
      color: Palette.ink,
      paddingVertical: 4,
      paddingHorizontal: 0,
    },
    otpInput: {
      letterSpacing: 4,
      fontWeight: '700',
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
    button: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.sm,
      borderRadius: Radius.lg,
      paddingVertical: 17,
      overflow: 'hidden',
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    resendButton: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    resendText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: Teal.primary,
    },
    successWrap: {
      gap: Spacing.xl,
      paddingTop: Spacing.md,
    },
    successIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: Accent.green.bg,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    backLink: {
      alignItems: 'center',
      paddingTop: Spacing.xxl,
    },
    backLinkText: {
      fontSize: 14,
      fontWeight: '600',
      color: Teal.primary,
    },
  });
}
