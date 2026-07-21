import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Card, Badge, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchPatients, fetchEhrRecords, createEhrRecord, updateIvfStatus } from '@/lib/api';

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'warning'> = {
  ongoing: 'info',
  completed: 'success',
  discontinued: 'warning',
};

export default function IVFSheetScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;
  const { Palette, Accent, Shadow, Type } = useTheme();
  const primaryColor = Palette.primary;
  const styles = useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const { data, loading, error, reload } = useApiData(() =>
    allCached(fetchPatients(), fetchEhrRecords('ivf', patientId)),
  );

  const [solution, setSolution] = useState('');
  const [volume, setVolume] = useState('');
  const [rate, setRate] = useState('');
  const [site, setSite] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const [patients, ivfRecords] = data ?? [[], []];
  const patient = patients.find((p) => p.id === patientId);

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  const handleSave = async () => {
    if (!solution.trim()) {
      Alert.alert('Error', 'IV solution is required (e.g., PNSS 1L, D5LR)');
      return;
    }
    const volumeNum = volume.trim() === '' ? null : parseInt(volume, 10);
    const rateNum = rate.trim() === '' ? null : parseInt(rate, 10);
    if (
      (volumeNum !== null && (Number.isNaN(volumeNum) || volumeNum <= 0)) ||
      (rateNum !== null && (Number.isNaN(rateNum) || rateNum <= 0))
    ) {
      Alert.alert('Error', 'Volume and rate must be positive numbers');
      return;
    }

    setSaving(true);
    try {
      const result = await createEhrRecord('ivf', patientId, {
        solution: solution.trim(),
        volume_ml: volumeNum,
        rate_ml_hr: rateNum,
        site,
        remarks,
      });
      if (result.queued) {
        Alert.alert(
          'Saved Offline',
          'No connection right now — the IVF record is queued and will sync automatically.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        setSolution('');
        setVolume('');
        setRate('');
        setSite('');
        setRemarks('');
        await reload();
        Alert.alert('IVF Record Saved', 'The infusion was added to the flow sheet.');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to save the record');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (recordId: string, status: 'completed' | 'discontinued') => {
    Alert.alert(
      status === 'completed' ? 'Complete Infusion' : 'Discontinue Infusion',
      `Mark this infusion as ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await updateIvfStatus(recordId, status);
              await reload();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Unable to update status');
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.patientHeader}>
        <View style={[styles.patientAvatar, { backgroundColor: primaryColor }]}>
          <Ionicons name="person" size={28} color="#fff" />
        </View>
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{patient.name}</Text>
          <Text style={styles.patientMeta}>
            {patient.room_number ? `Room ${patient.room_number}` : 'No room'} •{' '}
            {patient.age !== null ? `${patient.age} yrs` : 'Age —'} • {patient.gender ?? '—'}
          </Text>
        </View>
      </View>

      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>IVF Sheet</Text>
        <Text style={styles.sheetSubtitle}>IV Fluid Infusion Record</Text>
        <View style={styles.sheetDate}>
          <Ionicons name="calendar" size={16} color="#64748b" />
          <Text style={styles.sheetDateText}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>

      <Card style={styles.formCard}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="water" size={18} color="#0891b2" /> New Infusion
        </Text>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Solution *</Text>
          <TextInput
            style={styles.input}
            value={solution}
            onChangeText={setSolution}
            placeholder="e.g., PNSS 1L, D5LR 500ml"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputHalf, { marginRight: 8 }]}>
            <Text style={styles.inputLabel}>Volume (ml)</Text>
            <TextInput
              style={styles.input}
              value={volume}
              onChangeText={setVolume}
              keyboardType="number-pad"
              placeholder="1000"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={[styles.inputHalf, { marginLeft: 8 }]}>
            <Text style={styles.inputLabel}>Rate (ml/hr)</Text>
            <TextInput
              style={styles.input}
              value={rate}
              onChangeText={setRate}
              keyboardType="number-pad"
              placeholder="120"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Insertion Site</Text>
          <TextInput
            style={styles.input}
            value={site}
            onChangeText={setSite}
            placeholder="e.g., Left metacarpal vein"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Remarks</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Optional clinical notes..."
            placeholderTextColor="#94a3b8"
            multiline
          />
        </View>
      </Card>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Infusion History</Text>
        <Card>
          {ivfRecords.length === 0 && (
            <Text style={styles.emptyHistory}>No infusions recorded for this patient yet</Text>
          )}
          {ivfRecords.map((record, index) => (
            <View
              key={record.id}
              style={[styles.historyItem, index < ivfRecords.length - 1 && styles.historyBorder]}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyDateTime}>
                  {new Date(record.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Badge
                  label={record.status ?? 'ongoing'}
                  variant={STATUS_VARIANT[record.status ?? 'ongoing'] ?? 'info'}
                  size="sm"
                />
              </View>
              <Text style={styles.historySolution}>{record.solution}</Text>
              <View style={styles.historyValues}>
                <View style={styles.historyValue}>
                  <Ionicons name="flask-outline" size={13} color="#0891b2" />
                  <Text style={styles.historyValueText}>
                    {record.volume_ml != null ? `${record.volume_ml} ml` : '— ml'}
                  </Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="speedometer-outline" size={13} color="#7c3aed" />
                  <Text style={styles.historyValueText}>
                    {record.rate_ml_hr != null ? `${record.rate_ml_hr} ml/hr` : '— ml/hr'}
                  </Text>
                </View>
                {record.site ? (
                  <View style={styles.historyValue}>
                    <Ionicons name="locate-outline" size={13} color="#64748b" />
                    <Text style={styles.historyValueText}>{record.site}</Text>
                  </View>
                ) : null}
              </View>
              {record.remarks ? <Text style={styles.historyRemarks}>{record.remarks}</Text> : null}
              {(record.status ?? 'ongoing') === 'ongoing' && (
                <View style={styles.statusActions}>
                  <Pressable
                    style={({ pressed }) => [styles.statusButton, styles.statusButtonComplete, pressed && { opacity: 0.7 }]}
                    onPress={() => handleStatusChange(record.id, 'completed')}
                  >
                    <Text style={[styles.statusButtonText, { color: Accent.green.fg }]}>Complete</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.statusButton, styles.statusButtonDiscontinue, pressed && { opacity: 0.7 }]}
                    onPress={() => handleStatusChange(record.id, 'discontinued')}
                  >
                    <Text style={[styles.statusButtonText, { color: Accent.amber.fg }]}>Discontinue</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </Card>
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveButton, (pressed || saving) && { opacity: 0.85 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Ionicons name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save IVF Record'}</Text>
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
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Palette.background,
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    marginLeft: 14,
    flex: 1,
  },
  patientName: {
    fontSize: 20,
    fontWeight: '700',
    color: Palette.ink,
  },
  patientMeta: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  sheetHeader: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  sheetTitle: {
    ...Type.screenTitle,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginTop: 4,
  },
  sheetDate: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  sheetDateText: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginLeft: 8,
  },
  formCard: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Type.sectionTitle,
    color: Palette.text,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    marginTop: 14,
  },
  inputHalf: {
    flex: 1,
  },
  inputSection: {
    marginTop: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 16,
    color: Palette.ink,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  historySection: {
    marginBottom: Spacing.xl,
  },
  historyItem: {
    paddingVertical: 12,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDateTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
  },
  historySolution: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.ink,
    marginBottom: 6,
  },
  historyValues: {
    flexDirection: 'row',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  historyValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyValueText: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  historyRemarks: {
    fontSize: 11,
    color: Palette.textMuted,
    marginTop: 6,
  },
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  statusButtonComplete: {
    backgroundColor: Accent.green.bg,
  },
  statusButtonDiscontinue: {
    backgroundColor: Accent.amber.bg,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyHistory: {
    fontSize: 13,
    color: Palette.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: Spacing.sm,
    ...Shadow.raised,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
  },
  });
}
