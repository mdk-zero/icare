import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { ScreenHeader, SectionHeader } from '@/components/ui';
import { mockPatients } from '@/lib/mocks';

const STATUS_ACCENT: Record<string, { fg: string; bg: string }> = {
  Stable: Accent.green,
  Guarded: Accent.amber,
  Critical: Accent.red,
};

export default function EHRScreen() {
  const router = useRouter();

  const stats = [
    { label: 'Total', value: mockPatients.length, icon: 'people' as const, accent: Accent.teal },
    { label: 'Critical', value: 2, icon: 'warning' as const, accent: Accent.red },
    { label: 'Guarded', value: 1, icon: 'alert-circle' as const, accent: Accent.amber },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="EHR System"
        title="Patient Records"
        subtitle={`${mockPatients.length} patients in database`}
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

      <SectionHeader title="Patient Records" count={mockPatients.length} />
      {mockPatients.map((patient) => {
        const status = STATUS_ACCENT[patient.status] ?? Accent.slate;
        return (
          <Pressable
            key={patient.id}
            style={({ pressed }) => [styles.patientCard, pressed && styles.pressedCard]}
            onPress={() => router.push(`/ehr/${patient.id}`)}
          >
            <View style={styles.patientHeader}>
              <View style={[styles.avatarContainer, { backgroundColor: status.bg }]}>
                <Ionicons name="person" size={18} color={status.fg} />
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <Text style={styles.patientDetails}>
                  {patient.age} yrs • {patient.gender}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: status.fg }]} />
                <Text style={[styles.statusBadgeText, { color: status.fg }]}>{patient.status}</Text>
              </View>
            </View>

            <View style={styles.patientDetailsSection}>
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="bed-outline" size={14} color={Palette.textMuted} />
                  <Text style={styles.detailLabel}>Room</Text>
                </View>
                <Text style={styles.detailValue}>{patient.room}</Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="medkit-outline" size={14} color={Palette.textMuted} />
                  <Text style={styles.detailLabel}>Diagnosis</Text>
                </View>
                <Text style={styles.detailValue} numberOfLines={1}>{patient.diagnosis}</Text>
              </View>
              <View style={[styles.detailRow, styles.detailRowLast]}>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar-outline" size={14} color={Palette.textMuted} />
                  <Text style={styles.detailLabel}>Admitted</Text>
                </View>
                <Text style={styles.detailValue}>
                  {new Date(patient.admittedDate).toLocaleDateString()}
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
    paddingBottom: 32,
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
