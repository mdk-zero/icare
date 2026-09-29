import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchAssistanceRequests, requestAssistance, resolveAssistanceRequest } from '@/lib/api';
import { ApiError } from '@/lib/client';

/**
 * One tap (and a confirm) to flag the instructor. There is nothing to write:
 * the instructor is notified by name, with the scenario and patient attached,
 * and walks over. The confirm guards against a stray touch. While a request is
 * open the button shows it, and the student can call it off.
 */
export function AssistanceButton({
  scenarioTitle,
  patientId,
  patientName,
}: {
  scenarioTitle: string;
  patientId?: string | null;
  patientName?: string | null;
}) {
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  const { data, reload } = useApiData(fetchAssistanceRequests);
  const open = (data ?? []).find((r) => r.status !== 'resolved') ?? null;
  const [busy, setBusy] = React.useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const where = patientName ? ` (patient: ${patientName})` : '';
      const result = await requestAssistance(`Needs help with "${scenarioTitle}"${where}.`, patientId ?? null);
      Alert.alert(
        result.queued ? 'Saved offline' : 'Instructor notified',
        result.queued
          ? 'You are offline. Your instructor will be notified as soon as you reconnect.'
          : 'Your instructor has been told you need help and will come to you.',
      );
    } catch (err) {
      // Already asked: the instructor has it, so show it as open rather than fail.
      if (!(err instanceof ApiError && err.status === 409)) {
        Alert.alert('Could not send', err instanceof Error ? err.message : 'Please try again.');
      }
    } finally {
      await reload();
      setBusy(false);
    }
  };

  const confirmRequest = () =>
    Alert.alert('Request instructor assistance?', 'Your instructor will be notified that you need help.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, I need help', onPress: send },
    ]);

  const cancelRequest = () => {
    if (!open) return;
    Alert.alert('Cancel your request?', 'Let your instructor know you no longer need help.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'I no longer need help',
        onPress: async () => {
          setBusy(true);
          try {
            await resolveAssistanceRequest(open.id);
          } catch (err) {
            Alert.alert('Could not update', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            await reload();
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (open) {
    return (
      <View style={styles.openCard}>
        <Ionicons name="hand-left" size={18} color={Accent.amber.fg} />
        <View style={styles.openBody}>
          <Text style={styles.openTitle}>
            {open.status === 'acknowledged' ? 'Your instructor is on the way' : 'Help requested'}
          </Text>
          <Text style={styles.openText}>
            {open.status === 'acknowledged'
              ? 'Your instructor saw your request.'
              : 'Your instructor has been notified.'}
          </Text>
          <Pressable onPress={cancelRequest} disabled={busy} hitSlop={6} accessibilityRole="button">
            <Text style={styles.cancelText}>{busy ? 'Updating…' : 'I no longer need help'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
      onPress={confirmRequest}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Request instructor assistance"
    >
      {busy ? (
        <ActivityIndicator size="small" color={Accent.amber.fg} />
      ) : (
        <Ionicons name="hand-left-outline" size={16} color={Accent.amber.fg} />
      )}
      <Text style={styles.buttonText}>Request instructor assistance</Text>
    </Pressable>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: Accent.amber.bg,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.md,
    },
    pressed: { opacity: 0.7 },
    buttonText: { fontSize: 13, fontWeight: '700', color: Accent.amber.fg },
    openCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      backgroundColor: Accent.amber.bg,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    openBody: { flex: 1 },
    openTitle: { fontSize: 14, fontWeight: '700', color: Accent.amber.fg },
    openText: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    cancelText: { fontSize: 12, fontWeight: '700', color: Palette.primary, marginTop: Spacing.sm },
  });
}
