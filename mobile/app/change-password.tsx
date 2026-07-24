import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { completeForcedPasswordChange } from '@/lib/api';

/**
 * First-login password change for admin-provisioned accounts. The root
 * navigator routes here whenever the session carries force_password_change,
 * and there is no way back until it is cleared — the web app behaves the same.
 */
const MIN_LENGTH = 8;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN_LENGTH && password === confirm && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await completeForcedPasswordChange(password);
      // The flag lives on the session, so re-read it before navigating or the
      // navigator will bounce straight back here.
      await refreshUser();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to set a new password next time you sign in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="key" size={26} color={Palette.primary} />
      </View>
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.subtitle}>
        {user?.email
          ? `${user.email} is using a temporary password. Choose your own to continue.`
          : 'Your account is using a temporary password. Choose your own to continue.'}
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>New password</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder={`At least ${MIN_LENGTH} characters`}
            placeholderTextColor={Palette.textMuted}
            style={styles.input}
            editable={!saving}
          />
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8}>
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={Palette.textMuted}
            />
          </Pressable>
        </View>
        {tooShort && (
          <Text style={styles.hintError}>Must be at least {MIN_LENGTH} characters.</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Confirm password</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!visible}
            autoCapitalize="none"
            placeholder="Re-enter the password"
            placeholderTextColor={Palette.textMuted}
            style={styles.input}
            editable={!saving}
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
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.submit,
          !canSubmit && styles.submitDisabled,
          pressed && styles.pressed,
        ]}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitText}>Save and continue</Text>
        )}
      </Pressable>

      <Pressable onPress={handleSignOut} style={({ pressed }) => [pressed && styles.pressed]}>
        <Text style={styles.signOut}>Sign out instead</Text>
      </Pressable>
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
    },
    submitDisabled: { opacity: 0.5 },
    submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    signOut: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: Palette.textMuted,
    },
    pressed: { opacity: 0.7 },
  });
}
