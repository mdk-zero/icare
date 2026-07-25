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
import { requestPasswordChange, confirmPasswordChange } from '@/lib/api';

const MIN_LENGTH = 8;

/**
 * Voluntary password change. The server emails a one-time code before applying
 * the change, so this runs in two phases: enter the new password to trigger the
 * code, then confirm the code. Accounts without a password (Google sign-in)
 * skip the current-password step and set one instead.
 */
export default function ChangePasswordFlowScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const hasPassword = user?.has_password !== false;
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [phase, setPhase] = React.useState<'form' | 'otp'>('form');
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canRequest =
    next.length >= MIN_LENGTH &&
    next === confirm &&
    (!hasPassword || current.length > 0) &&
    !busy;

  const finish = () => {
    setNotice(null);
    setError(null);
    setDone(true);
  };

  const handleRequest = async () => {
    if (!canRequest) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordChange(hasPassword ? current : '', next);
      if (result.success) {
        finish();
        return;
      }
      setNotice(result.message ?? 'We sent a verification code to your email.');
      if (result.devOtp) setOtp(result.devOtp);
      setPhase('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the password change.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordChange(hasPassword ? current : '', next, otp.trim());
      finish();
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
        <Text style={styles.subtitle}>Your new password is ready to use the next time you sign in.</Text>
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
        <Ionicons name="lock-closed" size={24} color={Palette.primary} />
      </View>
      <Text style={styles.title}>{hasPassword ? 'Change password' : 'Set a password'}</Text>
      <Text style={styles.subtitle}>
        {phase === 'form'
          ? 'For your security, we email a verification code before the change takes effect.'
          : notice ?? 'Enter the verification code we sent to your email.'}
      </Text>

      {phase === 'form' ? (
        <>
          {hasPassword && (
            <View style={styles.field}>
              <Text style={styles.label}>Current password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry={!visible}
                  autoCapitalize="none"
                  placeholder="Your current password"
                  placeholderTextColor={Palette.textMuted}
                  style={styles.input}
                  editable={!busy}
                />
              </View>
            </View>
          )}

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
            onPress={handleRequest}
            disabled={!canRequest}
            style={({ pressed }) => [styles.submit, !canRequest && styles.submitDisabled, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>Send verification code</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Verification code</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                placeholderTextColor={Palette.textMuted}
                style={styles.input}
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
            onPress={handleConfirm}
            disabled={otp.trim().length === 0 || busy}
            style={({ pressed }) => [
              styles.submit,
              (otp.trim().length === 0 || busy) && styles.submitDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>Update password</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setPhase('form');
              setOtp('');
              setError(null);
            }}
            disabled={busy}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.secondary}>Re-enter password details</Text>
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
      textAlign: 'left',
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
