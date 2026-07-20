import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge } from '@/components/ui';
import { mockPatients, getEHRForPatient, getTPRForPatient, getIVFForPatient } from '@/lib/api';
import { Colors } from '@/constants/theme';
import logoImg from '@/assets/images/logo-no-bg.png';

const primaryColor = Colors.light.primary;

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

  const getRecordTypeColor = (type: string) => {
    switch (type) {
      case 'nursing': return '#1B6B7B';
      case 'physician': return '#7c3aed';
      case 'laboratory': return '#0891b2';
      case 'progress': return '#d97706';
      default: return '#6b7280';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.patientHeader}>
        <View style={styles.logoContainer}>
          <Image source={logoImg} style={styles.logoImage} />
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
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Admitted</Text>
          <Text style={styles.infoValue}>{new Date(patient.admittedDate).toLocaleDateString()}</Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Flow Sheets</Text>
      <View style={styles.sheetButtons}>
        <TouchableOpacity 
          style={[styles.sheetButton, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}
          onPress={() => router.push(`/ehr/${patientId}/tpr`)}
        >
          <View style={[styles.sheetIconContainer, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="document-text" size={24} color="#b45309" />
          </View>
          <Text style={styles.sheetButtonTitle}>TPR Sheet</Text>
          <Text style={styles.sheetButtonSubtitle}>
            Temperature, Pulse & Respiration
          </Text>
          <View style={styles.sheetCount}>
            <Text style={styles.sheetCountText}>{tprRecords.length} records</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.sheetButton, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}
          onPress={() => router.push(`/ehr/${patientId}/ivf`)}
        >
          <View style={[styles.sheetIconContainer, { backgroundColor: '#cffafe' }]}>
            <Ionicons name="document-text" size={24} color="#0891b2" />
          </View>
          <Text style={styles.sheetButtonTitle}>IVF Sheet</Text>
          <Text style={styles.sheetButtonSubtitle}>
            Intake-Output & Vital Signs
          </Text>
          <View style={styles.sheetCount}>
            <Text style={styles.sheetCountText}>{ivfRecords.length} records</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Health Records</Text>

      {ehrRecords.length > 0 ? (
        ehrRecords.map((record, index) => (
          <Card key={record.id} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <View style={[styles.recordType, { backgroundColor: `${getRecordTypeColor(record.type)}20` }]}>
                <Text style={[styles.recordTypeText, { color: getRecordTypeColor(record.type) }]}>
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
        ))
      ) : (
        <Card>
          <Text style={styles.emptyText}>No records available</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6b7280' },
  patientHeader: { alignItems: 'center', marginBottom: 24 },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  logoImage: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  patientName: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  patientMeta: { flexDirection: 'row', marginTop: 8, marginBottom: 12 },
  metaText: { fontSize: 14, color: '#64748b' },
  infoCard: { marginBottom: 24 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  infoLabel: { fontSize: 14, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
  sheetButtons: {
    flexDirection: 'row',
    marginBottom: 24,
  },
sheetButton: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
  },
  sheetIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sheetButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  sheetButtonSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 10,
  },
  sheetCount: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  sheetCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  recordCard: { marginBottom: 12 },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recordType: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  recordTypeText: { fontSize: 10, fontWeight: '700' },
  recordDate: { fontSize: 12, color: '#94a3b8' },
  recordContent: { fontSize: 14, color: '#1e293b', lineHeight: 22, marginBottom: 12 },
  recordAuthor: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', padding: 16 },
});