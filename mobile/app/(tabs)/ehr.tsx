import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { ScreenHeader, SectionHeader, LoadingSpinner, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchPatients } from '@/lib/api';

export default function EHRScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, fromCache } = useApiData(fetchPatients);

  if (loading && !data) {
    return <LoadingSpinner />;
  }

  const patients = data ?? [];
  const stats = [
    { label: 'Total', value: patients.length, icon: 'people' as const, accent: Accent.teal },
    { label: 'In Rooms', value: patients.filter((p) => p.room_number).length, icon: 'bed' as const, accent: Accent.violet },
    { label: 'Diagnosed', value: patients.filter((p) => p.diagnosis).length, icon: 'medkit' as const, accent: Accent.amber },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <ScreenHeader
        eyebrow="EHR System"
        title="Patient Records"
        subtitle={`${patients.length} ${patients.length === 1 ? 'patient' : 'patients'} from your scenarios${fromCache ? ' (offline copy)' : ''}`}
        icon="folder-open-outline"
        accent="violet"
      />

      <View style={styles.statsContainer}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: stat.accent.bg }]}>
              <Ionicons name={stat.icon} size={18} color={stat.accent.fg} />
            </View>
            <Text style={[styles.statValue, { color: stat.accent.fg }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Patient Records" count={patients.length} />
      {patients.length === 0 && (
        <EmptyState
          icon={error ? 'cloud-offline-outline' : 'folder-open-outline'}
          message={error ?? 'No patients yet — they appear when your faculty assigns you a scenario with a linked patient.'}
        />
      )}
      {patients.map((patient) => {
        return (
          <Pressable
            key={patient.id}
            style={({ pressed }) => [styles.patientCard, pressed && styles.pressedCard]}
            onPress={() => router.push(`/ehr/${patient.id}`)}
          >
            <View style={styles.patientHeader}>
              <View style={[styles.avatarContainer, { backgroundColor: Accent.teal.bg }]}>
                <Ionicons name="person" size={18} color={Accent.teal.fg} />
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <Text style={styles.patientDetails}>
                  {patient.age !== null ? `${patient.age} yrs` : 'Age —'} • {patient.gender ?? '—'}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: Accent.slate.bg }]}>
                <Ionicons name="bed-outline" size={12} color={Accent.slate.fg} />
                <Text style={[styles.statusBadgeText, { color: Accent.slate.fg, marginLeft: 4 }]}>
                  {patient.room_number ?? 'Unassigned'}
                </Text>
              </View>
            </View>

            <View style={styles.patientDetailsSection}>
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="medkit-outline" size={14} color={Palette.textMuted} />
                  <Text style={styles.detailLabel}>Diagnosis</Text>
                </View>
                <Text style={styles.detailValue} numberOfLines={1}>{patient.diagnosis ?? '—'}</Text>
              </View>
              <View style={[styles.detailRow, styles.detailRowLast]}>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar-outline" size={14} color={Palette.textMuted} />
                  <Text style={styles.detailLabel}>Admitted</Text>
                </View>
                <Text style={styles.detailValue}>
                  {patient.admission_date ? new Date(patient.admission_date).toLocaleDateString() : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.viewRecord}>View Full Record</Text>
              <Ionicons name="chevron-forward" size={16} color={Palette.primary} />
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
  content: {
    padding: Spacing.lg,
    // clears the floating tab bar so the last items can scroll above it
    paddingBottom: 128,
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    ...Type.micro,
    fontWeight: '500',
    marginTop: 2,
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
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    fontWeight: '700',
  },
  patientDetails: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginTop: 2,
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
  patientDetailsSection: {
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  detailRowLast: {
    marginBottom: 0,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 6,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  viewRecord: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.primary,
  },
});
