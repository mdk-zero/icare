import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge } from '@/components/ui';
import { mockPatients, getEHRForPatient, getTPRForPatient, getIVFForPatient } from '@/lib/mocks';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';

const RECORD_TYPE_ACCENT: Record<string, { fg: string; bg: string }> = {
  nursing: Accent.teal,
  physician: Accent.violet,
  laboratory: Accent.cyan,
  progress: Accent.amber,
};

const STATUS_ACCENT: Record<string, { fg: string; bg: string }> = {
  Stable: Accent.green,
  Guarded: Accent.amber,
  Critical: Accent.red,
};

export default function EHRDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;

  const patient = mockPatients.find((p) => p.id === patientId);
  const ehrRecords = getEHRForPatient(patientId);
  const tprRecords = getTPRForPatient(patientId);
  const ivfRecords = getIVFForPatient(patientId);

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Patient not found</Text>
      </View>
    );
  }

  const status = STATUS_ACCENT[patient.status] ?? Accent.slate;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.patientHeader}>
        <View style={[styles.avatarContainer, { backgroundColor: status.bg }]}>
          <Ionicons name="person" size={30} color={status.fg} />
        </View>
        <Text style={styles.patientName}>{patient.name}</Text>
        <View style={styles.patientMeta}>
          <Text style={styles.metaText}>{patient.age} years • {patient.gender}</Text>
        </View>
        <Badge
          label={patient.status}
          variant={patient.status === 'Stable' ? 'success' : patient.status === 'Guarded' ? 'warning' : 'danger'}
        />
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Room</Text>
          <Text style={styles.infoValue}>{patient.room}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Diagnosis</Text>
          <Text style={styles.infoValue}>{patient.diagnosis}</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Text style={styles.infoLabel}>Admitted</Text>
          <Text style={styles.infoValue}>{new Date(patient.admittedDate).toLocaleDateString()}</Text>
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
          <Text style={styles.sheetButtonSubtitle}>Intake-Output & Vital Signs</Text>
          <View style={styles.sheetCount}>
            <Text style={styles.sheetCountText}>{ivfRecords.length} records</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Health Records</Text>

      {ehrRecords.length > 0 ? (
        ehrRecords.map((record) => {
          const accent = RECORD_TYPE_ACCENT[record.type] ?? Accent.slate;
          return (
            <Card key={record.id} style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <View style={[styles.recordType, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.recordTypeText, { color: accent.fg }]}>
                    {record.type.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.recordDate}>
                  {new Date(record.date).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.recordContent}>{record.content}</Text>
              <Text style={styles.recordAuthor}>Author: {record.author}</Text>
            </Card>
          );
        })
      ) : (
        <Card>
          <Text style={styles.emptyText}>No records available</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Palette.background },
  errorText: { fontSize: 16, color: Palette.textSecondary },
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
  recordContent: { fontSize: 14, color: Palette.text, lineHeight: 22, marginBottom: Spacing.md },
  recordAuthor: { fontSize: 12, color: Palette.textSecondary, fontStyle: 'italic' },
  emptyText: { fontSize: 14, color: Palette.textMuted, textAlign: 'center', padding: Spacing.lg },
});
