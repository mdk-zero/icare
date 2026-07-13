import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { ScreenHeader, EmptyState } from '@/components/ui';
import { fetchPatients, fetchMyVitals, Patient, VitalReading } from '@/lib/api';

const VITAL_FIELDS = [
  { key: 'hr', icon: 'heart' as const, accent: Accent.red, unit: 'bpm' },
  { key: 'bp', icon: 'speedometer' as const, accent: Accent.violet, unit: 'mmHg' },
  { key: 'temp', icon: 'thermometer' as const, accent: Accent.amber, unit: '°C' },
  { key: 'spo2', icon: 'water' as const, accent: Accent.cyan, unit: '%' },
];

function vitalValue(key: string, reading: VitalReading) {
  switch (key) {
    case 'hr':
      return reading.heart_rate != null ? String(reading.heart_rate) : '—';
    case 'bp':
      return reading.bp_systolic != null && reading.bp_diastolic != null
        ? `${reading.bp_systolic}/${reading.bp_diastolic}`
        : '—';
    case 'temp':
      return reading.temperature_c != null ? Number(reading.temperature_c).toFixed(1) : '—';
    case 'spo2':
      return reading.oxygen_saturation != null ? String(reading.oxygen_saturation) : '—';
    default:
      return '—';
  }
}

export default function VitalsScreen() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [latestByPatient, setLatestByPatient] = useState<Record<string, VitalReading>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [patientsResult, vitalsResult] = await Promise.all([fetchPatients(), fetchMyVitals()]);
      setPatients(patientsResult.data);
      setFromCache(patientsResult.fromCache || vitalsResult.fromCache);
      // readings come newest-first; keep the first per patient
      const latest: Record<string, VitalReading> = {};
      for (const reading of vitalsResult.data) {
        if (!latest[reading.patient_id]) latest[reading.patient_id] = reading;
      }
      setLatestByPatient(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load patients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getStatus = (reading: VitalReading | undefined) => {
    if (!reading) return { label: 'No data', color: Palette.textSecondary, bg: Palette.borderLight };
    if (reading.is_anomaly) return { label: 'Flagged', color: Accent.red.fg, bg: Accent.red.bg };
    return { label: 'Stable', color: Accent.green.fg, bg: Accent.green.bg };
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      <ScreenHeader
        eyebrow="Vitals Encoding"
        title="Patient Vitals"
        subtitle={`${patients.length} simulated patients`}
        icon="pulse"
        accent="red"
      />

      {fromCache && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={Accent.amber.fg} />
          <Text style={styles.offlineBannerText}>Offline — showing cached data</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color={Accent.red.fg} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {!error && patients.length === 0 && (
        <EmptyState icon="people-outline" message="No simulated patients available yet." />
      )}

      {patients.map((patient) => {
        const latest = latestByPatient[patient.id];
        const hasAnomaly = latest?.is_anomaly;
        const status = getStatus(latest);

        return (
          <Pressable
            key={patient.id}
            style={({ pressed }) => [
              styles.patientCard,
              hasAnomaly && styles.patientCardAlert,
              pressed && styles.pressedCard,
            ]}
            onPress={() => router.push(`/vitals/${patient.id}`)}
          >
            <View style={styles.patientHeader}>
              <View style={[styles.avatarContainer, { backgroundColor: status.bg }]}>
                <Ionicons name="person" size={20} color={status.color} />
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <View style={styles.patientRoomRow}>
                  <Ionicons name="bed-outline" size={12} color={Palette.textSecondary} />
                  <Text style={styles.patientRoom} numberOfLines={1}>
                    {patient.room_number ?? 'Unassigned'}
                    {patient.diagnosis ? ` · ${patient.diagnosis}` : ''}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            {latest && (
              <View style={styles.vitalsGrid}>
                {VITAL_FIELDS.map((field) => (
                  <View key={field.key} style={styles.vitalItem}>
                    <View style={[styles.vitalIconBox, { backgroundColor: field.accent.bg }]}>
                      <Ionicons name={field.icon} size={14} color={field.accent.fg} />
                    </View>
                    <Text style={[styles.vitalValue, hasAnomaly && styles.vitalAlert]}>
                      {vitalValue(field.key, latest)}
                    </Text>
                    <Text style={styles.vitalUnit}>{field.unit}</Text>
                  </View>
                ))}
              </View>
            )}

            {hasAnomaly && (
              <View style={styles.anomalyAlert}>
                <Ionicons name="warning" size={14} color={Accent.red.fg} />
                <Text style={styles.anomalyText}>
                  {latest.anomaly_reasons?.[0]?.message ?? 'Anomaly detected'}
                </Text>
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={styles.timestampRow}>
                <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
                <Text style={styles.timestamp}>
                  {latest
                    ? `Last encoded ${new Date(latest.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'No readings encoded yet'}
                </Text>
              </View>
              <View style={styles.viewMore}>
                <Text style={styles.viewMoreText}>Encode</Text>
                <Ionicons name="chevron-forward" size={14} color={Palette.primary} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 32,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Accent.amber.bg,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Accent.amber.fg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Accent.red.fg,
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  patientCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  patientCardAlert: {
    borderColor: Accent.red.border,
    backgroundColor: '#FEF7F7',
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  patientName: {
    ...Type.itemTitle,
    fontSize: 16,
    fontWeight: '700',
  },
  patientRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  patientRoom: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginLeft: 4,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  vitalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  vitalItem: {
    alignItems: 'center',
    flex: 1,
  },
  vitalIconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  vitalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  vitalAlert: {
    color: Accent.red.fg,
  },
  vitalUnit: {
    ...Type.micro,
    fontSize: 10,
    marginTop: 1,
    fontWeight: '500',
  },
  anomalyAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: Spacing.md,
  },
  anomalyText: {
    fontSize: 12,
    color: Accent.red.fg,
    fontWeight: '600',
    flexShrink: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  viewMore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.primary,
    marginRight: 2,
  },
});
