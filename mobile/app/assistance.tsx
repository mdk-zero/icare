import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { SectionHeader, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import {
  fetchAssistanceRequests,
  requestAssistance,
  resolveAssistanceRequest,
  AssistanceRequest,
} from '@/lib/api';

const MAX_MESSAGE = 500;

/** Canned openers, so a student in the middle of a simulation can flag fast. */
const QUICK_REASONS = [
  'I need help with a clinical procedure.',
  'I am unsure how to interpret these vital signs.',
  'I need help with the documentation (TPR/IVF/notes).',
  'A patient situation needs my instructor now.',
];

export default function AssistanceScreen() {
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchAssistanceRequests);
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const requests = data ?? [];
  const open = requests.find((r) => r.status !== 'resolved') ?? null;

  const handleSend = async () => {
    const text = message.trim();
    if (!text) {
      Alert.alert('Describe the problem', 'Tell your instructor what you need help with.');
      return;
    }
    setSending(true);
    try {
      const result = await requestAssistance(text);
      setMessage('');
      if (result.queued) {
        Alert.alert(
          'Saved offline',
          'You are offline. Your request is queued and will be sent as soon as you reconnect.',
        );
      } else {
        Alert.alert('Instructor notified', 'Your request has been sent to the faculty on duty.');
      }
      await reload();
    } catch (err) {
      Alert.alert('Could not send', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = (request: AssistanceRequest) => {
    Alert.alert('Close request', 'Mark this as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          try {
            await resolveAssistanceRequest(request.id);
            await reload();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Unable to update');
          }
        },
      },
    ]);
  };

  const statusAccent = (status: AssistanceRequest['status']) =>
    status === 'open' ? Accent.red : status === 'acknowledged' ? Accent.amber : Accent.green;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="hand-left" size={24} color="#fff" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Request Assistance</Text>
          <Text style={styles.headerDesc}>
            Raises a flag with the faculty handling your section.
          </Text>
        </View>
      </View>

      {open ? (
        <View style={styles.openCard}>
          <View style={styles.openHeader}>
            <View
              style={[styles.statusPill, { backgroundColor: statusAccent(open.status).bg }]}
            >
              <Text style={[styles.statusText, { color: statusAccent(open.status).fg }]}>
                {open.status === 'open' ? 'Waiting for instructor' : 'Instructor acknowledged'}
              </Text>
            </View>
          </View>
          <Text style={styles.openMessage}>{open.message}</Text>
          <Pressable
            onPress={() => handleResolve(open)}
            style={({ pressed }) => [styles.resolveButton, pressed && styles.pressed]}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={Palette.primary} />
            <Text style={styles.resolveText}>I no longer need help</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <SectionHeader title="What do you need help with?" />
          <View style={styles.composer}>
            <TextInput
              value={message}
              onChangeText={(t) => setMessage(t.slice(0, MAX_MESSAGE))}
              placeholder="Describe the problem…"
              placeholderTextColor={Palette.textMuted}
              multiline
              style={styles.input}
              editable={!sending}
            />
            <View style={styles.composerFooter}>
              <Text style={styles.counter}>
                {message.length}/{MAX_MESSAGE}
              </Text>
              <Pressable
                onPress={handleSend}
                disabled={sending || !message.trim()}
                style={({ pressed }) => [
                  styles.sendButton,
                  (sending || !message.trim()) && styles.sendDisabled,
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

          <View style={styles.quickWrap}>
            {QUICK_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => setMessage(reason)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
              >
                <Text style={styles.quickText}>{reason}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <SectionHeader title="History" count={requests.length} />

      {!loading && requests.length === 0 && (
        <EmptyState
          icon={error ? 'cloud-offline-outline' : 'hand-left-outline'}
          message={error ?? 'You have not requested assistance yet.'}
        />
      )}

      {requests.map((request) => {
        const accent = statusAccent(request.status);
        return (
          <View key={request.id} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View style={[styles.statusPill, { backgroundColor: accent.bg }]}>
                <Text style={[styles.statusText, { color: accent.fg }]}>{request.status}</Text>
              </View>
              <Text style={styles.historyDate}>
                {new Date(request.created_at).toLocaleString()}
              </Text>
            </View>
            <Text style={styles.historyMessage}>{request.message}</Text>
            {request.patients?.name && (
              <View style={styles.patientRow}>
                <Ionicons name="person-outline" size={12} color={Palette.textMuted} />
                <Text style={styles.patientText}>{request.patients.name}</Text>
              </View>
            )}
          </View>
        );
      })}
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
    headerDesc: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
      lineHeight: 17,
    },
    composer: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      ...Shadow.card,
    },
    input: {
      minHeight: 96,
      textAlignVertical: 'top',
      fontSize: 14,
      color: Palette.text,
      lineHeight: 20,
    },
    composerFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
    },
    counter: { fontSize: 11, color: Palette.textMuted },
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
    quickWrap: { marginTop: Spacing.md, gap: Spacing.sm },
    quickChip: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
    },
    quickText: { fontSize: 13, color: Palette.textSecondary },
    openCard: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      ...Shadow.card,
    },
    openHeader: { flexDirection: 'row', marginBottom: Spacing.sm },
    openMessage: { fontSize: 14, color: Palette.text, lineHeight: 20 },
    resolveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: Spacing.md,
    },
    resolveText: { fontSize: 13, fontWeight: '600', color: Palette.primary },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      alignSelf: 'flex-start',
    },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    historyCard: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      marginBottom: Spacing.sm + 2,
      ...Shadow.card,
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    historyDate: { fontSize: 11, color: Palette.textMuted },
    historyMessage: { ...Type.itemTitle, fontSize: 14, lineHeight: 20 },
    patientRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm },
    patientText: { fontSize: 12, color: Palette.textMuted },
    pressed: { opacity: 0.7 },
  });
}
