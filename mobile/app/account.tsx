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
import { updateProfile } from '@/lib/api';

const DETAILS: { icon: keyof typeof Ionicons.glyphMap; label: string; key: 'email' | 'role' | 'section' }[] = [
  { icon: 'mail-outline', label: 'Email', key: 'email' },
  { icon: 'ribbon-outline', label: 'Role', key: 'role' },
  { icon: 'school-outline', label: 'Section', key: 'section' },
];

export default function AccountScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [name, setName] = React.useState(user?.name ?? '');
  const [saving, setSaving] = React.useState(false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== (user?.name ?? '') && !saving;

  const handleSaveName = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateProfile(trimmed);
      await refreshUser();
      Alert.alert('Saved', 'Your name has been updated.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not update your name.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—';
  const detailValue = (key: 'email' | 'role' | 'section') => {
    if (key === 'email') return user?.email ?? '—';
    if (key === 'role') return roleLabel;
    return user?.section ? user.section : 'Not assigned';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionLabel}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Full name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={Palette.textMuted}
          editable={!saving}
          maxLength={120}
          autoCapitalize="words"
        />
        <Pressable
          onPress={handleSaveName}
          disabled={!canSave}
          style={({ pressed }) => [styles.saveButton, !canSave && styles.saveDisabled, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Account details</Text>
      <View style={styles.card}>
        {DETAILS.map((row, index) => (
          <View key={row.key} style={[styles.detailRow, index > 0 && styles.detailBorder]}>
            <View style={[styles.detailIcon, { backgroundColor: Accent.slate.bg }]}>
              <Ionicons name={row.icon} size={15} color={Accent.slate.fg} />
            </View>
            <Text style={styles.detailLabel}>{row.label}</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {detailValue(row.key)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Email, role, and section are managed by your administrator.</Text>

      <Text style={styles.sectionLabel}>Security</Text>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          onPress={() => router.push('/account/password')}
        >
          <View style={[styles.linkIcon, { backgroundColor: Accent.violet.bg }]}>
            <Ionicons name="lock-closed-outline" size={17} color={Accent.violet.fg} />
          </View>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>
              {user?.has_password === false ? 'Set a password' : 'Change password'}
            </Text>
            <Text style={styles.linkSub}>Confirmed with a code sent to your email</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
        </Pressable>
      </View>
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
    content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
    pressed: { opacity: 0.7 },
    sectionLabel: {
      ...Type.eyebrow,
      marginBottom: Spacing.sm,
      marginTop: Spacing.lg,
    },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: Palette.textSecondary,
      marginBottom: Spacing.sm,
    },
    input: {
      backgroundColor: Palette.surfaceMuted,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: 15,
      color: Palette.ink,
    },
    saveButton: {
      backgroundColor: Palette.primary,
      borderRadius: Radius.pill,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    saveDisabled: { opacity: 0.45 },
    saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
    },
    detailBorder: {
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    detailIcon: {
      width: 30,
      height: 30,
      borderRadius: Radius.sm + 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    detailLabel: {
      fontSize: 13,
      color: Palette.textSecondary,
    },
    detailValue: {
      flex: 1,
      textAlign: 'right',
      fontSize: 14,
      fontWeight: '600',
      color: Palette.ink,
      marginLeft: Spacing.md,
    },
    hint: {
      ...Type.micro,
      marginTop: Spacing.sm,
      paddingHorizontal: Spacing.xs,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    linkIcon: {
      width: 34,
      height: 34,
      borderRadius: Radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    linkTextWrap: { flex: 1 },
    linkTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: Palette.ink,
    },
    linkSub: {
      fontSize: 11.5,
      color: Palette.textSecondary,
      marginTop: 2,
    },
  });
}
