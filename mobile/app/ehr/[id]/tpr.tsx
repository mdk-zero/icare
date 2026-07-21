import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Card, Badge, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchPatients, fetchEhrRecords, createEhrRecord } from '@/lib/api';

export default function TPRSheetScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;
  const { Palette, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const primaryColor = Palette.primary;

  const { data, loading, error, reload } = useApiData(() =>
    allCached(fetchPatients(), fetchEhrRecords('tpr', patientId)),
  );

  const [temperature, setTemperature] = useState('');
  const [pulse, setPulse] = useState('');
  const [respiration, setRespiration] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const [patients, tprRecords] = data ?? [[], []];
  const patient = patients.find((p) => p.id === patientId);

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  const handleSave = async () => {
    const tempNum = temperature.trim() === '' ? null : parseFloat(temperature);
    const pulseNum = pulse.trim() === '' ? null : parseInt(pulse, 10);
    const respNum = respiration.trim() === '' ? null : parseInt(respiration, 10);

    if (tempNum === null && pulseNum === null && respNum === null) {
      Alert.alert('Error', 'Enter at least one of temperature, pulse, or respiration');
      return;
    }
    if ([tempNum, pulseNum, respNum].some((v) => v !== null && Number.isNaN(v))) {
      Alert.alert('Error', 'Please enter valid numeric values');
      return;
    }
    if (tempNum !== null && (tempNum < 30 || tempNum > 45)) {
      Alert.alert('Error', 'Temperature should be between 30-45°C');
      return;
    }
    if (pulseNum !== null && (pulseNum < 30 || pulseNum > 200)) {
      Alert.alert('Error', 'Pulse should be between 30-200 bpm');
      return;
    }
    if (respNum !== null && (respNum < 5 || respNum > 50)) {
      Alert.alert('Error', 'Respiration should be between 5-50 /min');
      return;
    }

    setSaving(true);
    try {
      const result = await createEhrRecord('tpr', patientId, {
        temperature_c: tempNum,
        pulse: pulseNum,
        respiration: respNum,
        remarks,
      });
      if (result.queued) {
        Alert.alert(
          'Saved Offline',
          'No connection right now — the TPR entry is queued and will sync automatically.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        setTemperature('');
        setPulse('');
        setRespiration('');
        setRemarks('');
        await reload();
        Alert.alert('TPR Record Saved', 'The entry was added to the flow sheet.');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to save the record');
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.sheetTitle}>TPR Sheet</Text>
        <Text style={styles.sheetSubtitle}>Temperature, Pulse & Respiration Record</Text>
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
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="thermometer" size={16} color="#d97706" /> Temperature (°C)
          </Text>
          <TextInput
            style={styles.input}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
            placeholder="36.0 - 38.0"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="heart" size={16} color="#dc2626" /> Pulse (bpm)
          </Text>
          <TextInput
            style={styles.input}
            value={pulse}
            onChangeText={setPulse}
            keyboardType="number-pad"
            placeholder="60 - 100"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="analytics" size={16} color="#7c3aed" /> Respiration (/min)
          </Text>
          <TextInput
            style={styles.input}
            value={respiration}
            onChangeText={setRespiration}
            keyboardType="number-pad"
            placeholder="12 - 20"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="create" size={16} color="#64748b" /> Remarks
          </Text>
          <TextInput
            style={[styles.input, styles.remarksInput]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Optional observations"
            placeholderTextColor="#94a3b8"
          />
        </View>
      </Card>

      <View style={styles.referenceSection}>
        <Text style={styles.referenceTitle}>Normal Ranges</Text>
        <View style={styles.referenceGrid}>
          <View style={[styles.referenceItem, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="thermometer" size={20} color="#d97706" />
            <Text style={styles.referenceLabel}>Temperature</Text>
            <Text style={styles.referenceValue}>36.0 - 38.0°C</Text>
          </View>
          <View style={[styles.referenceItem, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="heart" size={20} color="#dc2626" />
            <Text style={styles.referenceLabel}>Pulse</Text>
            <Text style={styles.referenceValue}>60 - 100 bpm</Text>
          </View>
          <View style={[styles.referenceItem, { backgroundColor: '#ede9fe' }]}>
            <Ionicons name="analytics" size={20} color="#7c3aed" />
            <Text style={styles.referenceLabel}>Respiration</Text>
            <Text style={styles.referenceValue}>12 - 20 /min</Text>
          </View>
        </View>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>TPR History</Text>
        <Card>
          {tprRecords.length === 0 && (
            <Text style={styles.emptyHistory}>No TPR entries for this patient yet</Text>
          )}
          {tprRecords.slice(0, 5).map((record, index) => (
            <View
              key={record.id}
              style={[
                styles.historyItem,
                index < Math.min(tprRecords.length, 5) - 1 && styles.historyBorder,
              ]}
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
                {record.temperature_c == null ? (
                  <Badge label="No Temp" size="sm" />
                ) : record.temperature_c > 38 || record.temperature_c < 36 ? (
                  <Badge label="Fever" variant="danger" size="sm" />
                ) : record.temperature_c > 37.5 ? (
                  <Badge label="Low Grade" variant="warning" size="sm" />
                ) : (
                  <Badge label="Normal" variant="success" size="sm" />
                )}
              </View>
              <View style={styles.historyValues}>
                <View style={styles.historyValue}>
                  <Ionicons name="thermometer" size={14} color="#d97706" />
                  <Text style={styles.historyValueText}>
                    {record.temperature_c != null ? `${record.temperature_c}°C` : '—'}
                  </Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="heart" size={14} color="#dc2626" />
                  <Text style={styles.historyValueText}>{record.pulse ?? '—'}</Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="analytics" size={14} color="#7c3aed" />
                  <Text style={styles.historyValueText}>{record.respiration ?? '—'}</Text>
                </View>
              </View>
              {record.remarks ? <Text style={styles.historyRemarks}>{record.remarks}</Text> : null}
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
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save TPR Record'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
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
    marginBottom: 20,
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
    marginBottom: 20,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 18,
    color: Palette.ink,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  remarksInput: {
    fontSize: 16,
  },
  referenceSection: {
    marginBottom: 20,
  },
  referenceTitle: {
    ...Type.eyebrow,
    marginBottom: Spacing.md,
  },
  referenceGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  referenceItem: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.md,
  },
  referenceLabel: {
    fontSize: 11,
    color: Palette.textSecondary,
    marginTop: 6,
  },
  referenceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.text,
    marginTop: 4,
  },
  historySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...Type.sectionTitle,
    marginBottom: Spacing.md,
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
    marginBottom: 8,
  },
  historyDateTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
  },
  historyValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  historyValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyValueText: {
    fontSize: 13,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  historyRemarks: {
    fontSize: 11,
    color: Palette.textMuted,
    marginTop: 6,
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
