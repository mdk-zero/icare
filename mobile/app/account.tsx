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
import { Image } from 'expo-image';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAvatarImage, useAvatarPicker } from '@/hooks/useAvatar';
import { updateProfile } from '@/lib/api';

/** First letter of the first name plus the last — matches the web avatar. */
function getInitials(value?: string) {
  const words = (value ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return 'S';
  const letterOf = (w: string) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
  const last = words.length > 1 ? letterOf(words[words.length - 1]) : '';
  return (letterOf(words[0]) + last).toUpperCase() || 'S';
}

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

  const { photoUrl: avatarUrl, source: avatarSource } = useAvatarImage(user);
  const initials = getInitials(user?.name);
  const { uploading, changeAvatar } = useAvatarPicker();

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
      <Text style={styles.sectionLabel}>Profile photo</Text>
      <View style={styles.card}>
        <View style={styles.photoRow}>
          <Pressable
            onPress={changeAvatar}
            disabled={uploading}
            hitSlop={6}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            {avatarSource ? (
              <Image source={avatarSource} style={styles.photo} contentFit="cover" />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
                <Text style={styles.photoInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.photoBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={13} color="#fff" />
              )}
            </View>
          </Pressable>
          <View style={styles.photoText}>
            <Text style={styles.photoTitle}>
              {avatarUrl ? 'Your profile photo' : 'No photo yet'}
            </Text>
            <Text style={styles.photoSub}>
              Shown on your dashboard and to your faculty. JPEG or PNG, cropped to a square.
            </Text>
            <Pressable onPress={changeAvatar} disabled={uploading} hitSlop={8}>
              <Text style={[styles.photoAction, uploading && styles.photoActionBusy]}>
                {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

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
            <Text style={styles.linkTitle}>Change password</Text>
            <Text style={styles.linkSub}>Verified with a code sent to your email</Text>
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
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.lg,
    },
    photo: {
      width: 72,
      height: 72,
      borderRadius: 36,
    },
    photoFallback: {
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoInitials: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '700',
    },
    photoBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      // Rides the edge of the photo, so it needs a ring in the card's own
      // colour to stay readable against a busy image.
      borderWidth: 2,
      borderColor: Palette.surface,
    },
    photoText: {
      flex: 1,
    },
    photoTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: Palette.ink,
    },
    photoSub: {
      fontSize: 12,
      color: Palette.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    photoAction: {
      fontSize: 13,
      fontWeight: '700',
      color: Palette.primary,
      marginTop: Spacing.sm,
    },
    photoActionBusy: {
      color: Palette.textMuted,
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
