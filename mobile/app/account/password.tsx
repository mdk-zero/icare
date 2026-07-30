import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/client';
import { requestPasswordReset, checkPasswordResetCode, resetPassword } from '@/lib/api';

const MIN_LENGTH = 8;

/**
 * Voluntary password change, code-first. A verification code is emailed the
 * moment the screen opens; the new password is only entered after the code is
 * confirmed. This reuses the emailed-reset flow (no current password), so the
 * emailed code is what proves the change is really you.
 */
export default function ChangePasswordFlowScreen() {
  const router = useRouter();
  const { user, isBootstrapping } = useAuth();
  const email = user?.email ?? '';
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [phase, setPhase] = React.useState<'code' | 'password'>('code');
  const [otp, setOtp] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const sendCode = React.useCallback(async () => {
    if (!email) {
      setError('This account has no email on file, so a code cannot be sent.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await requestPasswordReset(email);
      setNotice(result.message ?? `We sent a verification code to ${email}.`);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'google_no_password') {
        setError('This account signs in with Google and has no password to change.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not send the verification code.');
      }
    } finally {
      setSending(false);
    }
  }, [email]);

  // Email the code as soon as the screen opens -- but exactly once, which is
  // the ref's job and not the dependency array's. `email` is '' until useAuth
  // finishes bootstrapping and can flip back to '' on a token refresh or an
  // offline/online cycle, and every one of those transitions rebuilds sendCode
  // and re-runs this effect. Without the ref each of them mails the same
  // person another code, for as long as the screen stays open. Sending again
  // is the Resend button's job.
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    // Waiting for bootstrap is what keeps the empty-email failure below from
    // firing on every cold start, before useAuth has restored the session.
    if (autoSent.current || isBootstrapping) return;
    autoSent.current = true;
    if (!email) {
      setError('This account has no email on file, so a code cannot be sent.');
      return;
    }
    void sendCode();
  }, [isBootstrapping, email, sendCode]);

  const handleVerify = async () => {
    if (otp.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checkPasswordResetCode(email, otp);
      setPhase('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired verification code.');
    } finally {
      setBusy(false);
    }
  };

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canReset = next.length >= MIN_LENGTH && next === confirm && !busy;

  const handleReset = async () => {
    if (!canReset) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email, otp, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.doneContainer}>
        <View style={[styles.iconWrap, { backgroundColor: Accent.green.bg }]}>
          <Ionicons name="checkmark-circle-outline" size={30} color={Accent.green.fg} />
        </View>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.subtitleCentered}>
          Your new password is ready to use the next time you sign in.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.submit, pressed && styles.pressed]}
        >
          <Text style={styles.submitText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={phase === 'code' ? 'mail-outline' : 'lock-closed'} size={24} color={Palette.primary} />
      </View>
      <Text style={styles.title}>{phase === 'code' ? 'Verify it’s you' : 'Choose a new password'}</Text>
      <Text style={styles.subtitle}>
        {phase === 'code'
          ? notice ?? (sending ? 'Sending a verification code to your email…' : 'Enter the code sent to your email.')
          : 'Your identity is confirmed. Set your new password below.'}
      </Text>

      {phase === 'code' ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Verification code</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                placeholderTextColor={Palette.textMuted}
                style={[styles.input, styles.otpInput]}
                editable={!busy}
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Accent.red.fg} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleVerify}
            disabled={otp.length < 6 || busy}
            style={({ pressed }) => [
              styles.submit,
              (otp.length < 6 || busy) && styles.submitDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>Verify code</Text>
            )}
          </Pressable>

          <Pressable onPress={sendCode} disabled={sending || busy} style={({ pressed }) => [pressed && styles.pressed]}>
            <Text style={styles.secondary}>{sending ? 'Sending…' : 'Didn’t get a code? Resend'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={next}
                onChangeText={setNext}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder={`At least ${MIN_LENGTH} characters`}
                placeholderTextColor={Palette.textMuted}
                style={styles.input}
                editable={!busy}
              />
              <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={visible ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Palette.textMuted}
                />
              </Pressable>
            </View>
            {tooShort && <Text style={styles.hintError}>Must be at least {MIN_LENGTH} characters.</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm new password</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!visible}
                autoCapitalize="none"
                placeholder="Re-enter the new password"
                placeholderTextColor={Palette.textMuted}
                style={styles.input}
                editable={!busy}
              />
            </View>
            {mismatch && <Text style={styles.hintError}>Passwords do not match.</Text>}
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Accent.red.fg} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleReset}
            disabled={!canReset}
            style={({ pressed }) => [styles.submit, !canReset && styles.submitDisabled, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>Update password</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingTop: Spacing.xl },
    doneContainer: {
      flex: 1,
      backgroundColor: Palette.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
    },
    pressed: { opacity: 0.7 },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: Radius.lg,
      backgroundColor: Palette.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    title: { ...Type.screenTitle, marginBottom: Spacing.sm },
    subtitle: {
      fontSize: 13,
      color: Palette.textSecondary,
      lineHeight: 19,
      marginBottom: Spacing.xl,
    },
    subtitleCentered: {
      fontSize: 13,
      color: Palette.textSecondary,
      lineHeight: 19,
      marginBottom: Spacing.xl,
      textAlign: 'center',
    },
    field: { marginBottom: Spacing.lg },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: Palette.textSecondary,
      marginBottom: Spacing.sm,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Palette.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
      ...Shadow.card,
    },
    input: { flex: 1, paddingVertical: Spacing.md, fontSize: 14, color: Palette.text },
    otpInput: { letterSpacing: 4, fontWeight: '700', fontSize: 18 },
    hintError: { fontSize: 12, color: Accent.red.fg, marginTop: 6 },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Accent.red.bg,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    errorText: { flex: 1, fontSize: 13, color: Accent.red.fg },
    submit: {
      backgroundColor: Palette.primary,
      borderRadius: Radius.pill,
      paddingVertical: Spacing.md + 2,
      alignItems: 'center',
      marginBottom: Spacing.lg,
      minWidth: 200,
    },
    submitDisabled: { opacity: 0.5 },
    submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondary: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: Palette.textMuted,
    },
  });
}
