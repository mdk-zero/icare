import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { mockPatients, getVitalSignsForPatient } from '@/lib/mocks';

const primaryColor = Palette.primary;

export default function VitalDetailScreen() {
  const { id } = useLocalSearchParams();
  const patientId = id as string;

  const patient = mockPatients.find((p) => p.id === patientId);
  const vitals = getVitalSignsForPatient(patientId);
  const latestVital = vitals.length > 0 ? vitals[vitals.length - 1] : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Stable': return Accent.green.fg;
      case 'Guarded': return Accent.amber.fg;
      case 'Critical': return Accent.red.fg;
      default: return Palette.textSecondary;
    }
  };

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Patient not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.patientHeader}>
        <View style={styles.patientCard}>
          <View style={[styles.avatarContainer, { backgroundColor: getStatusColor(patient.status) + '15' }]}>
            <Ionicons name="person" size={32} color={getStatusColor(patient.status)} />
          </View>
          <Text style={styles.patientName}>{patient.name}</Text>
          <View style={styles.patientMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color="#64748b" />
              <Text style={styles.metaText}>{patient.age} years • {patient.gender}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(patient.status) + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(patient.status) }]} />
              <Text style={[styles.statusBadgeText, { color: getStatusColor(patient.status) }]}>{patient.status}</Text>
            </View>
          </View>
          <View style={styles.roomRow}>
            <Ionicons name="bed-outline" size={14} color="#94a3b8" />
            <Text style={styles.roomText}>{patient.room}</Text>
          </View>
        </View>
      </View>

      <View style={styles.alertSection}>
        <View style={styles.alertHeader}>
          <Ionicons name="pulse" size={20} color="#d97706" />
          <Text style={styles.alertTitle}>Anomaly Detection</Text>
        </View>
        <Text style={styles.alertDesc}>
          Real-time monitoring with rule-based detection:
        </Text>
        <View style={styles.rulesGrid}>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#dc2626' }]} />
            <Text style={styles.ruleText}>HR: 60-100 bpm</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#7c3aed' }]} />
            <Text style={styles.ruleText}>BP: &lt;140/90</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#d97706' }]} />
            <Text style={styles.ruleText}>Temp: 36-38°C</Text>
          </View>
          <View style={styles.ruleItem}>
            <View style={[styles.ruleDot, { backgroundColor: '#0891b2' }]} />
            <Text style={styles.ruleText}>SpO2: ≥95%</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Vitals</Text>
        {latestVital && (
          <View style={styles.vitalsCard}>
            <View style={styles.vitalsGrid}>
              <View style={styles.vitalItem}>
                <View style={[styles.vitalIconBox, { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="heart" size={18} color="#dc2626" />
                </View>
                <Text style={[styles.vitalValue, latestVital.isAnomaly && styles.vitalAlert]}>
                  {latestVital.heartRate}
                </Text>
                <Text style={styles.vitalLabel}>bpm</Text>
              </View>
              <View style={styles.vitalItem}>
                <View style={[styles.vitalIconBox, { backgroundColor: '#f3e8ff' }]}>
                  <Ionicons name="speedometer" size={18} color="#7c3aed" />
                </View>
                <Text style={[styles.vitalValue, latestVital.isAnomaly && styles.vitalAlert]}>
                  {latestVital.bloodPressureSystolic}/{latestVital.bloodPressureDiastolic}
                </Text>
                <Text style={styles.vitalLabel}>mmHg</Text>
              </View>
              <View style={styles.vitalItem}>
                <View style={[styles.vitalIconBox, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="thermometer" size={18} color="#d97706" />
                </View>
                <Text style={[styles.vitalValue, latestVital.isAnomaly && styles.vitalAlert]}>
                  {latestVital.temperature.toFixed(1)}
                </Text>
                <Text style={styles.vitalLabel}>°C</Text>
              </View>
              <View style={styles.vitalItem}>
                <View style={[styles.vitalIconBox, { backgroundColor: '#cffafe' }]}>
                  <Ionicons name="water" size={18} color="#0891b2" />
                </View>
                <Text style={[styles.vitalValue, latestVital.isAnomaly && styles.vitalAlert]}>
                  {latestVital.oxygenSaturation}
                </Text>
                <Text style={styles.vitalLabel}>%</Text>
              </View>
              <View style={styles.vitalItem}>
                <View style={[styles.vitalIconBox, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="analytics" size={18} color="#16a34a" />
                </View>
                <Text style={[styles.vitalValue, latestVital.isAnomaly && styles.vitalAlert]}>
                  {latestVital.respirationRate}
                </Text>
                <Text style={styles.vitalLabel}>/min</Text>
              </View>
            </View>
            {latestVital.isAnomaly && (
              <View style={styles.anomalyAlert}>
                <Ionicons name="warning" size={16} color="#dc2626" />
                <View style={styles.anomalyContent}>
                  <Text style={styles.anomalyTitle}>Anomaly Detected</Text>
                  <Text style={styles.anomalyDesc}>Requires clinical attention</Text>
                </View>
              </View>
            )}
            <View style={styles.timestampRow}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={styles.timestamp}>
                {new Date(latestVital.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History</Text>
        <View style={styles.historyCard}>
          {[...vitals].reverse().map((vital, index) => (
            <View
              key={vital.id}
              style={[styles.historyItem, index < vitals.length - 1 && styles.historyBorder]}
            >
              <View style={styles.historyHeader}>
                <View style={styles.historyTimeRow}>
                  <Ionicons name="time-outline" size={12} color="#64748b" />
                  <Text style={styles.historyTime}>
                    {new Date(vital.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {vital.isAnomaly && (
                  <View style={styles.anomalyDot} />
                )}
              </View>
              <View style={styles.historyVitals}>
                <View style={styles.historyVitalItem}>
                  <Text style={styles.historyVitalLabel}>HR</Text>
                  <Text style={[styles.historyVitalValue, vital.isAnomaly && styles.vitalAlert]}>{vital.heartRate}</Text>
                </View>
                <View style={styles.historyVitalItem}>
                  <Text style={styles.historyVitalLabel}>BP</Text>
                  <Text style={[styles.historyVitalValue, vital.isAnomaly && styles.vitalAlert]}>{vital.bloodPressureSystolic}/{vital.bloodPressureDiastolic}</Text>
                </View>
                <View style={styles.historyVitalItem}>
                  <Text style={styles.historyVitalLabel}>Temp</Text>
                  <Text style={[styles.historyVitalValue, vital.isAnomaly && styles.vitalAlert]}>{vital.temperature.toFixed(1)}</Text>
                </View>
                <View style={styles.historyVitalItem}>
                  <Text style={styles.historyVitalLabel}>SpO2</Text>
                  <Text style={[styles.historyVitalValue, vital.isAnomaly && styles.vitalAlert]}>{vital.oxygenSaturation}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Pressable style={({ pressed }) => [styles.recordButton, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.recordButtonText}>Record New Vitals</Text>
        </Pressable>
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
    alignItems: 'center',
    backgroundColor: Palette.background,
  },
  errorText: {
    fontSize: 16,
    color: Palette.textSecondary,
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  vitalsCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  vitalItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 16,
  },
  vitalIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  vitalLabel: {
    fontSize: 10,
    color: Palette.textMuted,
    marginTop: 2,
  },
  vitalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.ink,
  },
  vitalAlert: {
    color: Accent.red.fg,
  },
  anomalyAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  anomalyContent: {
    marginLeft: 10,
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
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primaryColor,
    borderRadius: Radius.md,
    paddingVertical: 15,
    ...Shadow.raised,
  },
  recordButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
  },
});