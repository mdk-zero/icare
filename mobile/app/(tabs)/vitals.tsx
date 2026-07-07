import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { fetchPatients, fetchMyVitals, Patient, VitalReading } from '@/lib/api';

const primaryColor = Colors.light.primary;

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
    if (!reading) return { label: 'No data', color: '#6b7280' };
    if (reading.is_anomaly) return { label: 'Flagged', color: '#dc2626' };
    return { label: 'Stable', color: '#16a34a' };
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
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
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.headerBadge}>
              <Ionicons name="pulse" size={12} color="#dc2626" />
              <Text style={styles.headerBadgeText}>Vitals Encoding</Text>
            </View>
            <Text style={styles.title}>Patient Vitals</Text>
            <Text style={styles.subtitle}>{patients.length} simulated patients</Text>
          </View>
          <View style={styles.headerIconBox}>
            <Ionicons name="pulse" size={28} color={primaryColor} />
          </View>
        </View>
      </View>

      {fromCache && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
          <Text style={styles.offlineBannerText}>Offline — showing cached data</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {!error && patients.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color="#cbd5e1" />
          <Text style={styles.emptyStateText}>No simulated patients available yet.</Text>
        </View>
      )}

      {patients.map((patient) => {
        const latest = latestByPatient[patient.id];
        const hasAnomaly = latest?.is_anomaly;
        const status = getStatus(latest);

        return (
          <TouchableOpacity
            key={patient.id}
            style={[styles.patientCard, hasAnomaly && styles.patientCardAlert]}
            onPress={() => router.push(`/vitals/${patient.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.patientHeader}>
              <View style={[styles.avatarContainer, { backgroundColor: status.color + '15' }]}>
                <Ionicons name="person" size={22} color={status.color} />
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{patient.name}</Text>
                <View style={styles.patientRoomRow}>
                  <Ionicons name="bed-outline" size={12} color="#64748b" />
                  <Text style={styles.patientRoom}>
                    {patient.room_number ?? 'Unassigned'}
                    {patient.diagnosis ? ` · ${patient.diagnosis}` : ''}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.color + '15' }]}>
                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            {latest && (
              <View style={styles.vitalsGrid}>
                <View style={styles.vitalItem}>
                  <View style={[styles.vitalIconBox, { backgroundColor: '#fee2e2' }]}>
                    <Ionicons name="heart" size={14} color="#dc2626" />
                  </View>
                  <Text style={[styles.vitalValue, hasAnomaly && styles.vitalAlert]}>
                    {latest.heart_rate ?? '—'}
                  </Text>
                  <Text style={styles.vitalUnit}>bpm</Text>
                </View>
                <View style={styles.vitalItem}>
                  <View style={[styles.vitalIconBox, { backgroundColor: '#f3e8ff' }]}>
                    <Ionicons name="speedometer" size={14} color="#7c3aed" />
                  </View>
                  <Text style={[styles.vitalValue, hasAnomaly && styles.vitalAlert]}>
                    {latest.bp_systolic != null && latest.bp_diastolic != null
                      ? `${latest.bp_systolic}/${latest.bp_diastolic}`
                      : '—'}
                  </Text>
                  <Text style={styles.vitalUnit}>mmHg</Text>
                </View>
                <View style={styles.vitalItem}>
                  <View style={[styles.vitalIconBox, { backgroundColor: '#fef3c7' }]}>
                    <Ionicons name="thermometer" size={14} color="#d97706" />
                  </View>
                  <Text style={[styles.vitalValue, hasAnomaly && styles.vitalAlert]}>
                    {latest.temperature_c != null ? Number(latest.temperature_c).toFixed(1) : '—'}
                  </Text>
                  <Text style={styles.vitalUnit}>°C</Text>
                </View>
                <View style={styles.vitalItem}>
                  <View style={[styles.vitalIconBox, { backgroundColor: '#cffafe' }]}>
                    <Ionicons name="water" size={14} color="#0891b2" />
                  </View>
                  <Text style={[styles.vitalValue, hasAnomaly && styles.vitalAlert]}>
                    {latest.oxygen_saturation ?? '—'}
                  </Text>
                  <Text style={styles.vitalUnit}>%</Text>
                </View>
              </View>
            )}

            {hasAnomaly && (
              <View style={styles.anomalyAlert}>
                <Ionicons name="warning" size={14} color="#dc2626" />
                <Text style={styles.anomalyText}>
                  {latest.anomaly_reasons?.[0]?.message ?? 'Anomaly detected'}
                </Text>
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={styles.timestampRow}>
                <Ionicons name="time-outline" size={12} color="#94a3b8" />
                <Text style={styles.timestamp}>
                  {latest
                    ? `Last encoded ${new Date(latest.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'No readings encoded yet'}
                </Text>
              </View>
              <View style={styles.viewMore}>
                <Text style={styles.viewMoreText}>Encode</Text>
                <Ionicons name="chevron-forward" size={14} color={primaryColor} />
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 4,
  },
  headerIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: primaryColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  
  patientCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  patientCardAlert: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    flex: 1,
    marginLeft: 12,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  patientRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  patientRoom: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
  vitalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  vitalItem: {
    alignItems: 'center',
    flex: 1,
  },
  vitalIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  vitalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  vitalAlert: {
    color: '#dc2626',
  },
  vitalUnit: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  anomalyAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  anomalyText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
    marginLeft: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 4,
  },
  viewMore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: primaryColor,
    marginRight: 4,
  },
});