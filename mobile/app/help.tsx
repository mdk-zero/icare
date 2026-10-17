import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { SectionHeader } from '@/components/ui';
import { sendSupportRequest, SupportTopic } from '@/lib/api';

/** Mirrors web/app/lib/support.ts. */
const TOPICS: { value: SupportTopic; label: string }[] = [
  { value: 'problem', label: "Something isn't working" },
  { value: 'question', label: 'How do I…?' },
  { value: 'account', label: 'Account or sign-in' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Something else' },
];

const MAX_SUBJECT = 150;
const MAX_MESSAGE = 4000;
const CONTACT_EMAIL = 'contact@i-care.dev';

/**
 * Help & Support for students and instructors: writes to the iCARE++ team,
 * who reply by email. Clinical help from an instructor is Request Assistance.
 */
export default function HelpScreen() {
  const { user } = useAuth();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [topic, setTopic] = React.useState<SupportTopic | null>(null);
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const canSend = !!topic && subject.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!topic) {
      Alert.alert('Pick a topic', 'Choose what your message is about.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Add the details', 'Write a subject and a message.');
      return;
    }
    setSending(true);
    try {
      await sendSupportRequest({ topic, subject: subject.trim(), message: message.trim() });
      setTopic(null);
      setSubject('');
      setMessage('');
      setSent(true);
    } catch (err) {
      Alert.alert('Could not send', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="help-buoy" size={24} color="#fff" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <Text style={styles.headerDesc}>
            Report a problem with the app or ask the iCARE++ team a question.
          </Text>
        </View>
      </View>

      {sent ? (
        <View style={styles.card}>
          <View style={[styles.sentIcon, { backgroundColor: Accent.green.bg }]}>
            <Ionicons name="checkmark-circle" size={22} color={Accent.green.fg} />
          </View>
          <Text style={styles.sentTitle}>Message sent</Text>
          <Text style={styles.sentBody}>
            The team will reply to {user?.email ?? 'your account email'}. A copy of your message is
            on its way there too.
          </Text>
          <Pressable
            onPress={() => setSent(false)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Write another message</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <SectionHeader title="What is this about?" />
          <View style={styles.chips}>
            {TOPICS.map((t) => {
              const active = topic === t.value;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTopic(t.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.card, styles.form]}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={MAX_SUBJECT}
              placeholder="A few words that sum it up"
              placeholderTextColor={Palette.textMuted}
              editable={!sending}
              style={styles.input}
            />

            <Text style={[styles.fieldLabel, styles.fieldGap]}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              maxLength={MAX_MESSAGE}
              placeholder="What were you trying to do, and what happened instead?"
              placeholderTextColor={Palette.textMuted}
              multiline
              editable={!sending}
              style={[styles.input, styles.messageInput]}
            />

            <View style={styles.footer}>
              <Text style={styles.counter}>
                {message.length}/{MAX_MESSAGE}
              </Text>
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend && styles.sendDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.sendText}>Send</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <Text style={styles.hint}>
            Your name, role, and email are attached for you. Never send a password.
          </Text>
        </>
      )}

      <Pressable
        onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        style={({ pressed }) => [styles.emailRow, pressed && styles.pressed]}
      >
        <Ionicons name="mail-outline" size={16} color={Palette.textSecondary} />
        <Text style={styles.emailText}>
          Prefer email? Write to <Text style={styles.emailLink}>{CONTACT_EMAIL}</Text>
        </Text>
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
    content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
    pressed: { opacity: 0.7 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.primary,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    headerIcon: {
      width: 46,
      height: 46,
      borderRadius: Radius.md,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    headerDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, lineHeight: 17 },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      ...Shadow.card,
    },
    form: { marginTop: Spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    chipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
    chipTextActive: { color: '#fff' },
    fieldLabel: { ...Type.caption, fontWeight: '600', marginBottom: Spacing.xs },
    fieldGap: { marginTop: Spacing.md },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
      fontSize: 14,
      color: Palette.text,
      backgroundColor: Palette.background,
    },
    messageInput: { minHeight: 140, textAlignVertical: 'top', lineHeight: 20 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.md,
    },
    counter: { ...Type.micro },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Palette.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm + 2,
      borderRadius: Radius.pill,
      minWidth: 92,
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.5 },
    sendText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    hint: { ...Type.micro, marginTop: Spacing.sm, lineHeight: 16 },
    sentIcon: {
      width: 42,
      height: 42,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    sentTitle: { ...Type.sectionTitle },
    sentBody: { ...Type.body, color: Palette.textSecondary, marginTop: Spacing.xs, lineHeight: 20 },
    secondaryButton: {
      alignSelf: 'flex-start',
      marginTop: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    secondaryText: { fontSize: 13, fontWeight: '700', color: Palette.primary },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.xl,
      paddingVertical: Spacing.sm,
    },
    emailText: { ...Type.caption, flex: 1 },
    emailLink: { color: Palette.primary, fontWeight: '600' },
  });
}
