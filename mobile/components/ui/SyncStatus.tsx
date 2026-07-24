import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getOutbox, flushOutbox, isOnline, subscribeConnectivity } from '@/lib/client';

/**
 * Offline/pending-sync banner. Clinical writes made without a connection go to
 * an outbox and were previously flushed silently, so a student had no way to
 * know whether their vitals entry had actually reached the server.
 *
 * Renders nothing when online with an empty queue.
 */
export default function SyncStatus({ onSynced }: { onSynced?: () => void }) {
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);

  const [pending, setPending] = React.useState(0);
  const [online, setOnlineState] = React.useState(isOnline());
  const [syncing, setSyncing] = React.useState(false);

  const refreshCount = React.useCallback(async () => {
    const items = await getOutbox();
    setPending(items.length);
  }, []);

  React.useEffect(() => {
    void refreshCount();
    // The queue also drains from useAuth on launch, so re-check periodically
    // rather than assuming this component saw every change.
    const timer = setInterval(() => void refreshCount(), 5000);
    const unsubscribe = subscribeConnectivity(setOnlineState);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [refreshCount]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await flushOutbox();
      await refreshCount();
      if (result.rejected.length > 0) {
        Alert.alert(
          'Some entries were rejected',
          result.rejected.map((r) => `${r.label}: ${r.error}`).join('\n'),
        );
      }
      if (result.sent > 0) onSynced?.();
    } finally {
      setSyncing(false);
    }
  };

  if (online && pending === 0) return null;

  const label = !online
    ? pending > 0
      ? `Offline — ${pending} change${pending === 1 ? '' : 's'} waiting to sync`
      : 'Offline — showing saved data'
    : `${pending} change${pending === 1 ? '' : 's'} waiting to sync`;

  return (
    <View style={[styles.banner, online ? styles.pendingTone : styles.offlineTone]}>
      <Ionicons
        name={online ? 'cloud-upload-outline' : 'cloud-offline-outline'}
        size={16}
        color={online ? Accent.amber.fg : Palette.textSecondary}
      />
      <Text style={[styles.text, { color: online ? Accent.amber.fg : Palette.textSecondary }]}>
        {label}
      </Text>
      {online && pending > 0 && (
        <Pressable onPress={handleSync} disabled={syncing} hitSlop={8}>
          {syncing ? (
            <ActivityIndicator size="small" color={Accent.amber.fg} />
          ) : (
            <Text style={[styles.action, { color: Accent.amber.fg }]}>Sync now</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
      marginBottom: Spacing.md,
    },
    offlineTone: { backgroundColor: Palette.surfaceMuted },
    pendingTone: { backgroundColor: Accent.amber.bg },
    text: { flex: 1, fontSize: 12, fontWeight: '600' },
    action: { fontSize: 12, fontWeight: '700' },
  });
}
