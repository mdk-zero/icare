import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchPatients, fetchEhrRecords, createEhrRecord, EhrRecord } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type HistoryEntry = { kind: 'tpr' | 'ivf'; record: EhrRecord };

const IVF_STATUS_VARIANT: Record<string, 'info' | 'success' | 'warning'> = {
  ongoing: 'info',
  completed: 'success',
  discontinued: 'warning',
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EHRDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const { data, loading, refreshing, error, refresh, reload } = useApiData(() =>
    allCached(
      fetchPatients(),
      fetchEhrRecords('tpr', patientId),
      fetchEhrRecords('ivf', patientId),
      fetchEhrRecords('note', patientId),
    ),
  );

  const [note, setNote] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const [patients, tprRecords, ivfRecords, noteRecords] = data ?? [[], [], [], []];
  const patient = patients.find((p) => p.id === patientId);

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  // Most-recent charting activity across both flow sheets, newest first, so the
  // history is visible on the record itself rather than only inside each sheet.
  const history: HistoryEntry[] = [
    ...tprRecords.map((record) => ({ kind: 'tpr' as const, record })),
    ...ivfRecords.map((record) => ({ kind: 'ivf' as const, record })),
  ]
    .sort((a, b) => new Date(b.record.created_at).getTime() - new Date(a.record.created_at).getTime())
    .slice(0, 6);

  const handleAddNote = async () => {
    const content = note.trim();
    if (!content) return;
    setSavingNote(true);
    try {
      const result = await createEhrRecord('note', patientId, { content });
      setNote('');
      if (result.queued) {
        Alert.alert(
          'Saved Offline',
          'No connection right now — the progress note is queued and will sync automatically.',
        );
      } else {
        await reload();
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to save the note');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.patientHeader}>
        <View style={[styles.avatarContainer, { backgroundColor: Accent.teal.bg }]}>
          <Ionicons name="person" size={30} color={Accent.teal.fg} />
        </View>
        <Text style={styles.patientName}>{patient.name}</Text>
        <View style={styles.patientMeta}>
          <Text style={styles.metaText}>
            {patient.age !== null ? `${patient.age} years` : 'Age —'} • {patient.gender ?? '—'}
          </Text>
        </View>
        <Badge label={patient.room_number ? `Room ${patient.room_number}` : 'No room'} variant="info" />
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Diagnosis</Text>
          <Text style={styles.infoValue}>{patient.diagnosis ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Admitted</Text>
          <Text style={styles.infoValue}>
            {patient.admission_date ? new Date(patient.admission_date).toLocaleDateString() : '—'}
          </Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Text style={styles.infoLabel}>Medical History</Text>
          <Text style={styles.infoValue}>{patient.medical_history ?? '—'}</Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Record History</Text>
      {history.length > 0 ? (
        <Card style={styles.historyCard}>
          {history.map((entry, index) => {
            const { record } = entry;
            const isTpr = entry.kind === 'tpr';
            const accent = isTpr ? Accent.amber : Accent.cyan;
            const parts: string[] = [];
            if (isTpr) {
              if (record.temperature_c != null) parts.push(`${record.temperature_c}°C`);
              if (record.pulse != null) parts.push(`P ${record.pulse}`);
              if (record.respiration != null) parts.push(`R ${record.respiration}`);
            } else {
              if (record.volume_ml != null) parts.push(`${record.volume_ml} ml`);
              if (record.rate_ml_hr != null) parts.push(`${record.rate_ml_hr} ml/hr`);
              if (record.site) parts.push(record.site);
            }
            return (
              <View
                key={`${entry.kind}-${record.id}`}
                style={[styles.historyItem, index < history.length - 1 && styles.historyBorder]}
              >
                <View style={[styles.historyIcon, { backgroundColor: accent.bg }]}>
                  <Ionicons
                    name={isTpr ? 'thermometer-outline' : 'water-outline'}
                    size={16}
                    color={accent.fg}
                  />
                </View>
                <View style={styles.historyBody}>
                  <View style={styles.historyTopRow}>
                    <Text style={styles.historyTitle}>
                      {isTpr ? 'TPR' : record.solution ?? 'IVF'}
                    </Text>
                    {!isTpr && (
                      <Badge
                        label={record.status ?? 'ongoing'}
                        variant={IVF_STATUS_VARIANT[record.status ?? 'ongoing'] ?? 'info'}
                        size="sm"
                      />
                    )}
                  </View>
                  <Text style={styles.historyValues}>{parts.join('  ·  ') || 'No values recorded'}</Text>
                  <Text style={styles.historyTime}>{formatTimestamp(record.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      ) : (
        <Card>
          <Text style={styles.emptyText}>No TPR or IVF entries charted for this patient yet</Text>
        </Card>
      )}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Flow Sheets</Text>
      <View style={styles.sheetButtons}>
        <Pressable
          style={({ pressed }) => [styles.sheetButton, pressed && styles.pressed]}
          onPress={() => router.push(`/ehr/${patientId}/tpr`)}
        >
          <View style={[styles.sheetIconContainer, { backgroundColor: Accent.amber.bg }]}>
            <Ionicons name="thermometer-outline" size={22} color={Accent.amber.fg} />
          </View>
          <Text style={styles.sheetButtonTitle}>TPR Sheet</Text>
          <Text style={styles.sheetButtonSubtitle}>Temperature, Pulse & Respiration</Text>
          <View style={styles.sheetCount}>
            <Text style={styles.sheetCountText}>{tprRecords.length} records</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.sheetButton, pressed && styles.pressed]}
          onPress={() => router.push(`/ehr/${patientId}/ivf`)}
        >
          <View style={[styles.sheetIconContainer, { backgroundColor: Accent.cyan.bg }]}>
            <Ionicons name="water-outline" size={22} color={Accent.cyan.fg} />
          </View>
          <Text style={styles.sheetButtonTitle}>IVF Sheet</Text>
          <Text style={styles.sheetButtonSubtitle}>IV Fluids & Infusion Status</Text>
          <View style={styles.sheetCount}>
            <Text style={styles.sheetCountText}>{ivfRecords.length} records</Text>
          </View>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Progress Notes</Text>

      <Card style={styles.composer}>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Add a progress note for this patient…"
          placeholderTextColor={Palette.textMuted}
          multiline
          editable={!savingNote}
        />
        <Pressable
          style={({ pressed }) => [
            styles.noteButton,
            (!note.trim() || savingNote) && styles.noteButtonDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleAddNote}
          disabled={!note.trim() || savingNote}
        >
          {savingNote ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.noteButtonText}>Save note</Text>
            </>
          )}
        </Pressable>
      </Card>

      {noteRecords.length > 0 ? (
        noteRecords.map((record) => (
          <Card key={record.id} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <View style={[styles.recordType, { backgroundColor: record.reviewed_at ? Accent.green.bg : Accent.amber.bg }]}>
                <Text style={[styles.recordTypeText, { color: record.reviewed_at ? Accent.green.fg : Accent.amber.fg }]}>
                  {record.reviewed_at ? 'REVIEWED' : 'PENDING REVIEW'}
                </Text>
              </View>
              <Text style={styles.recordDate}>
                {new Date(record.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.recordContent}>{record.content}</Text>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={styles.emptyText}>No progress notes for this patient yet</Text>
        </Card>
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
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  patientHeader: { alignItems: 'center', marginBottom: Spacing.xxl },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  patientName: { ...Type.screenTitle },
  patientMeta: { flexDirection: 'row', marginTop: 6, marginBottom: Spacing.md },
  metaText: { fontSize: 14, color: Palette.textSecondary },
  infoCard: { marginBottom: Spacing.xxl },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 14, color: Palette.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: Palette.ink, flexShrink: 1, textAlign: 'right', marginLeft: Spacing.md },
  sectionTitle: { ...Type.sectionTitle, marginBottom: Spacing.md },
  sectionSpacer: { marginTop: Spacing.xxl },
  historyCard: { paddingVertical: Spacing.xs, marginBottom: Spacing.md },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  historyBody: { flex: 1 },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink, flexShrink: 1, marginRight: Spacing.sm },
  historyValues: { fontSize: 13, color: Palette.textSecondary },
  historyTime: { fontSize: 11, color: Palette.textMuted, marginTop: 4 },
  sheetButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  sheetButton: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  sheetIconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm + 2,
  },
  sheetButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.ink,
  },
  sheetButtonSubtitle: {
    fontSize: 11,
    color: Palette.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.sm + 2,
  },
  sheetCount: {
    backgroundColor: Palette.borderLight,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  sheetCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  composer: { marginBottom: Spacing.md },
  noteInput: {
    minHeight: 72,
    fontSize: 14,
    color: Palette.ink,
    textAlignVertical: 'top',
    padding: 0,
    marginBottom: Spacing.md,
  },
  noteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.primary,
    borderRadius: Radius.md,
    paddingVertical: 11,
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.lg,
  },
  noteButtonDisabled: { opacity: 0.5 },
  noteButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  recordCard: { marginBottom: Spacing.md },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recordType: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  recordTypeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  recordDate: { fontSize: 12, color: Palette.textMuted },
  recordContent: { fontSize: 14, color: Palette.text, lineHeight: 22 },
  emptyText: { fontSize: 14, color: Palette.textMuted, textAlign: 'center', padding: Spacing.lg },
  });
}
