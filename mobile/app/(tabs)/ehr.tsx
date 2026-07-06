import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { Card, Avatar } from '@/components/ui';
import { mockPatients } from '@/lib/api';

const primaryColor = Colors.light.primary;

export default function EHRScreen() {
  const router = useRouter();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Stable': return '#16a34a';
      case 'Guarded': return '#d97706';
      case 'Critical': return '#dc2626';
      default: return '#6b7280';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.headerBadge}>
              <Ionicons name="folder-open" size={12} color="#7c3aed" />
              <Text style={styles.headerBadgeText}>EHR System</Text>
            </View>
            <Text style={styles.title}>Patient Records</Text>
            <Text style={styles.subtitle}>
              {mockPatients.length} patients in database
            </Text>
          </View>
          <View style={styles.headerIconBox}>
            <Ionicons name="folder-open-outline" size={24} color="#7c3aed" />
          </View>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIconBox, { backgroundColor: primaryColor + '15' }]}>
            <Ionicons name="people" size={20} color={primaryColor} />
          </View>
          <Text style={styles.statValue}>{mockPatients.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconBox, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="warning" size={20} color="#dc2626" />
          </View>
          <Text style={[styles.statValue, { color: '#dc2626' }]}>2</Text>
          <Text style={styles.statLabel}>Critical</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconBox, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="alert-circle" size={20} color="#d97706" />
          </View>
          <Text style={[styles.statValue, { color: '#d97706' }]}>1</Text>
          <Text style={styles.statLabel}>Guarded</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Records</Text>
        <View style={styles.patientList}>
          {mockPatients.map((patient) => (
            <TouchableOpacity
              key={patient.id}
              style={styles.patientCard}
              onPress={() => router.push(`/ehr/${patient.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.patientHeader}>
                <View style={[styles.avatarContainer, { backgroundColor: getStatusColor(patient.status) + '15' }]}>
                  <Ionicons name="person" size={20} color={getStatusColor(patient.status)} />
                </View>
                <View style={styles.patientInfo}>
                  <Text style={styles.patientName}>{patient.name}</Text>
                  <Text style={styles.patientDetails}>
                    {patient.age} yrs • {patient.gender}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(patient.status) + '15' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(patient.status) }]} />
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(patient.status) }]}>
                    {patient.status}
                  </Text>
                </View>
              </View>

              <View style={styles.patientDetailsSection}>
                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="bed-outline" size={14} color="#94a3b8" />
                    <Text style={styles.detailLabel}>Room</Text>
                  </View>
                  <Text style={styles.detailValue}>{patient.room}</Text>
                </View>
                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="medkit-outline" size={14} color="#94a3b8" />
                    <Text style={styles.detailLabel}>Diagnosis</Text>
                  </View>
                  <Text style={styles.detailValue} numberOfLines={1}>{patient.diagnosis}</Text>
                </View>
                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
                    <Text style={styles.detailLabel}>Admitted</Text>
                  </View>
                  <Text style={styles.detailValue}>
                    {new Date(patient.admittedDate).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.viewRecord}>View Full Record</Text>
                <Ionicons name="chevron-forward" size={18} color={primaryColor} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
    backgroundColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
    marginLeft: 4,
  },
  headerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
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
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  patientList: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  patientCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    marginLeft: 12,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  patientDetails: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  patientDetailsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 6,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    textAlign: 'right',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  viewRecord: {
    fontSize: 13,
    fontWeight: '600',
    color: primaryColor,
  },
});