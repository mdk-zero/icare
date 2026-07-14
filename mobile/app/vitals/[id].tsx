import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { LoadingSpinner, EmptyState } from '@/components/ui';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchPatients, fetchMyVitals, submitVitalReading, VitalReading } from '@/lib/api';
import { VITAL_RULES } from '@/lib/vitals-rules';

const primaryColor = Palette.primary;

function fmt(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  return digits > 0 ? value.toFixed(digits) : String(value);
}

function VitalsRow({ reading }: { reading: VitalReading }) {
  return (
    <View style={styles.historyVitals}>
      <View style={styles.historyVitalItem}>
        <Text style={styles.historyVitalLabel}>HR</Text>
        <Text style={[styles.historyVitalValue, reading.is_anomaly && styles.vitalAlert]}>
          {fmt(reading.heart_rate)}
        </Text>
      </View>
      <View style={styles.historyVitalItem}>
        <Text style={styles.historyVitalLabel}>BP</Text>
        <Text style={[styles.historyVitalValue, reading.is_anomaly && styles.vitalAlert]}>
          {reading.bp_systolic != null || reading.bp_diastolic != null
            ? `${fmt(reading.bp_systolic)}/${fmt(reading.bp_diastolic)}`
            : '—'}
        </Text>
      </View>
      <View style={styles.historyVitalItem}>
        <Text style={styles.historyVitalLabel}>Temp</Text>
        <Text style={[styles.historyVitalValue, reading.is_anomaly && styles.vitalAlert]}>
          {reading.temperature_c != null ? reading.temperature_c.toFixed(1) : '—'}
        </Text>
      </View>
      <View style={styles.historyVitalItem}>
        <Text style={styles.historyVitalLabel}>RR</Text>
        <Text style={[styles.historyVitalValue, reading.is_anomaly && styles.vitalAlert]}>
          {fmt(reading.respiratory_rate)}
        </Text>
      </View>
      <View style={styles.historyVitalItem}>
        <Text style={styles.historyVitalLabel}>SpO2</Text>
        <Text style={[styles.historyVitalValue, reading.is_anomaly && styles.vitalAlert]}>
          {fmt(reading.oxygen_saturation)}
        </Text>
      </View>
    </View>
  );
}

export default function VitalDetailScreen() {
  const { id } = useLocalSearchParams();
  const patientId = id as string;

  const { data, loading, error, reload } = useApiData(() =>
    allCached(fetchPatients(), fetchMyVitals(patientId)),
  );

  const [heartRate, setHeartRate] = useState('');
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [temperature, setTemperature] = useState('');
  const [respiration, setRespiration] = useState('');
  const [spo2, setSpo2] = useState('');
  const [painScore, setPainScore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !data) {
    return <LoadingSpinner />;
  }

  const [patients, readings] = data ?? [[], []];
  const patient = patients.find((p) => p.id === patientId);
  const latest = readings[0] ?? null;

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  const parseField = (raw: string, isFloat = false): number | null | 'invalid' => {
    if (raw.trim() === '') return null;
    const num = isFloat ? parseFloat(raw) : parseInt(raw, 10);
    return Number.isNaN(num) ? 'invalid' : num;
  };

  const handleRecord = async () => {
    const values = {
      heart_rate: parseField(heartRate),
      bp_systolic: parseField(bpSystolic),
      bp_diastolic: parseField(bpDiastolic),
      temperature_c: parseField(temperature, true),
      respiratory_rate: parseField(respiration),
      oxygen_saturation: parseField(spo2),
      pain_score: parseField(painScore),
    };

    if (Object.values(values).some((v) => v === 'invalid')) {
      Alert.alert('Error', 'Please enter valid numeric values');
      return;
    }
    const entries = Object.entries(values).filter(([, v]) => v !== null);
    if (entries.length === 0) {
      Alert.alert('Error', 'Enter at least one vital sign');
      return;
    }
    for (const rule of VITAL_RULES) {
      const value = values[rule.field as keyof typeof values];
      if (typeof value === 'number' && (value < rule.min || value > rule.max)) {
        Alert.alert('Error', `${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}`);
        return;
      }
    }
    const pain = values.pain_score;
    if (typeof pain === 'number' && (pain < 0 || pain > 10)) {
      Alert.alert('Error', 'Pain score must be between 0 and 10');
      return;
    }

    setSaving(true);
    try {
      const result = await submitVitalReading({
        patient_id: patientId,
        ...(values as Record<string, number | null>),
        notes,
      });

      setHeartRate('');
      setBpSystolic('');
      setBpDiastolic('');
      setTemperature('');
      setRespiration('');
      setSpo2('');
      setPainScore('');
      setNotes('');

      const anomalyDetail = result.anomaly_reasons.map((r) => `• ${r.message}`).join('\n');
      if (result.queued) {
        Alert.alert(
          result.is_anomaly ? 'Queued — Anomaly Flagged' : 'Saved Offline',
          (result.is_anomaly
            ? `Local rules flagged this reading:\n${anomalyDetail}\n\n`
            : '') + 'No connection right now — the reading is queued and will sync automatically.',
        );
      } else {
        await reload();
        if (result.is_anomaly) {
          Alert.alert('Anomaly Detected', `${anomalyDetail}\n\nYour faculty has been notified.`);
        } else {
          Alert.alert('Vitals Recorded', 'All values are within normal ranges.');
        }
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to record vitals');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.patientHeader}>
        <View style={styles.patientCard}>
          <View style={[styles.avatarContainer, { backgroundColor: Accent.teal.bg }]}>
            <Ionicons name="person" size={32} color={Accent.teal.fg} />
          </View>
          <Text style={styles.patientName}>{patient.name}</Text>
          <View style={styles.patientMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color="#64748b" />
              <Text style={styles.metaText}>
                {patient.age !== null ? `${patient.age} years` : 'Age —'} • {patient.gender ?? '—'}
              </Text>
            </View>
          </View>
          <View style={styles.roomRow}>
            <Ionicons name="bed-outline" size={14} color="#94a3b8" />
            <Text style={styles.roomText}>{patient.room_number ? `Room ${patient.room_number}` : 'No room'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.alertSection}>
        <View style={styles.alertHeader}>
          <Ionicons name="pulse" size={20} color="#d97706" />
          <Text style={styles.alertTitle}>Anomaly Detection</Text>
        </View>
        <Text style={styles.alertDesc}>
          Readings are checked against clinical thresholds — even offline:
        </Text>
        <View style={styles.rulesGrid}>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#dc2626' }]} />
            <Text style={styles.ruleText}>HR: 60-100 bpm</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#7c3aed' }]} />
            <Text style={styles.ruleText}>BP: 90-140/60-90</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#d97706' }]} />
            <Text style={styles.ruleText}>Temp: 36.1-37.5°C</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#0891b2' }]} />
            <Text style={styles.ruleText}>SpO2: ≥95%</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Record New Vitals</Text>
        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>HR (bpm)</Text>
              <TextInput
                style={styles.formInput}
                value={heartRate}
                onChangeText={setHeartRate}
                keyboardType="number-pad"
                placeholder="60-100"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Temp (°C)</Text>
              <TextInput
                style={styles.formInput}
                value={temperature}
                onChangeText={setTemperature}
                keyboardType="decimal-pad"
                placeholder="36.5"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>BP Systolic</Text>
              <TextInput
                style={styles.formInput}
                value={bpSystolic}
                onChangeText={setBpSystolic}
                keyboardType="number-pad"
                placeholder="120"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>BP Diastolic</Text>
              <TextInput
                style={styles.formInput}
                value={bpDiastolic}
                onChangeText={setBpDiastolic}
                keyboardType="number-pad"
                placeholder="80"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>RR (/min)</Text>
              <TextInput
                style={styles.formInput}
                value={respiration}
                onChangeText={setRespiration}
                keyboardType="number-pad"
                placeholder="12-20"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>SpO2 (%)</Text>
              <TextInput
                style={styles.formInput}
                value={spo2}
                onChangeText={setSpo2}
                keyboardType="number-pad"
                placeholder="95-100"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Pain (0-10)</Text>
              <TextInput
                style={styles.formInput}
                value={painScore}
                onChangeText={setPainScore}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Notes</Text>
              <TextInput
                style={styles.formInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.recordButton, (pressed || saving) && { opacity: 0.85 }]}
            onPress={handleRecord}
            disabled={saving}
          >
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.recordButtonText}>{saving ? 'Recording…' : 'Record Vitals'}</Text>
          </Pressable>
        </View>
      </View>

      {latest && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Reading</Text>
          <View style={styles.vitalsCard}>
            <VitalsRow reading={latest} />
            {latest.is_anomaly && (
              <View style={styles.anomalyAlert}>
                <Ionicons name="warning" size={16} color="#dc2626" />
                <View style={styles.anomalyContent}>
                  <Text style={styles.anomalyTitle}>Anomaly Detected</Text>
                  {latest.anomaly_reasons.map((reason, idx) => (
                    <Text key={idx} style={styles.anomalyDesc}>{reason.message}</Text>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.timestampRow}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={styles.timestamp}>
                {new Date(latest.recorded_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History</Text>
        <View style={styles.historyCard}>
          {readings.length === 0 && (
            <Text style={styles.emptyHistory}>No readings recorded for this patient yet</Text>
          )}
          {readings.map((reading, index) => (
            <View
              key={reading.id}
              style={[styles.historyItem, index < readings.length - 1 && styles.historyBorder]}
            >
              <View style={styles.historyHeader}>
                <View style={styles.historyTimeRow}>
                  <Ionicons name="time-outline" size={12} color="#64748b" />
                  <Text style={styles.historyTime}>
                    {new Date(reading.recorded_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                {reading.is_anomaly && <View style={styles.anomalyDot} />}
              </View>
              <VitalsRow reading={reading} />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Palette.background,
  },
  patientHeader: {
    marginBottom: Spacing.lg,
  },
  patientCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  patientName: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.ink,
    marginBottom: 8,
  },
  patientMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 13,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  roomText: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  alertSection: {
    backgroundColor: Accent.amber.bg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Accent.amber.border,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
    marginLeft: 8,
  },
  alertDesc: {
    fontSize: 13,
    color: '#92400e',
    marginBottom: 12,
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ruleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  ruleText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '500',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Type.sectionTitle,
    marginBottom: Spacing.md,
  },
  formCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  formField: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.text,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: Palette.border,
  },
  vitalsCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  vitalAlert: {
    color: Accent.red.fg,
  },
  anomalyAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  anomalyContent: {
    marginLeft: 10,
    flex: 1,
  },
  anomalyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Accent.red.fg,
  },
  anomalyDesc: {
    fontSize: 11,
    color: Accent.red.fg,
    marginTop: 2,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  timestamp: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  historyCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  historyItem: {
    paddingVertical: 10,
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
  historyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  anomalyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Accent.red.fg,
  },
  historyVitals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyVitalItem: {
    alignItems: 'center',
  },
  historyVitalLabel: {
    fontSize: 10,
    color: Palette.textMuted,
    marginBottom: 2,
  },
  historyVitalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  emptyHistory: {
    fontSize: 13,
    color: Palette.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primaryColor,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: Spacing.xs,
    ...Shadow.raised,
  },
  recordButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
  },
});
