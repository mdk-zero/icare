import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, LoadingSpinner, EmptyState } from '@/components/ui';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchPatients, fetchEhrRecords } from '@/lib/api';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';

export default function EHRDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;

  const { data, loading, refreshing, error, refresh } = useApiData(() =>
    allCached(
      fetchPatients(),
      fetchEhrRecords('tpr', patientId),
      fetchEhrRecords('ivf', patientId),
      fetchEhrRecords('note', patientId),
    ),
  );

  if (loading && !data) {
    return <LoadingSpinner />;
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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

      <Text style={styles.sectionTitle}>Flow Sheets</Text>
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

      <Text style={styles.sectionTitle}>My Progress Notes</Text>

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

const styles = StyleSheet.create({
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
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1E293B', flexShrink: 1, textAlign: 'right', marginLeft: Spacing.md },
  sectionTitle: { ...Type.sectionTitle, marginBottom: Spacing.md },
  sheetButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
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
    color: '#1E293B',
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
