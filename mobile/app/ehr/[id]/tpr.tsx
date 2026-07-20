import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { Card, Badge, PrimaryButton } from '@/components/ui';
import { mockPatients, getTPRForPatient } from '@/lib/api';

const primaryColor = Colors.light.primary;

export default function TPRSheetScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;

  const patient = mockPatients.find((p) => p.id === patientId);
  const tprRecords = getTPRForPatient(patientId);

  const latestTPR = tprRecords.length > 0 ? tprRecords[tprRecords.length - 1] : null;

  const [temperature, setTemperature] = useState(latestTPR?.temperature?.toString() || '37.0');
  const [pulse, setPulse] = useState(latestTPR?.pulse?.toString() || '72');
  const [respiration, setRespiration] = useState(latestTPR?.respiration?.toString() || '18');
  const [signature, setSignature] = useState(latestTPR?.signature || '');

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Patient not found</Text>
      </View>
    );
  }

  const handleSave = () => {
    const tempNum = parseFloat(temperature);
    const pulseNum = parseInt(pulse);
    const respNum = parseInt(respiration);

    if (isNaN(tempNum) || isNaN(pulseNum) || isNaN(respNum)) {
      Alert.alert('Error', 'Please enter valid numeric values');
      return;
    }

    if (tempNum < 30 || tempNum > 45) {
      Alert.alert('Error', 'Temperature should be between 30-45°C');
      return;
    }

    if (pulseNum < 30 || pulseNum > 200) {
      Alert.alert('Error', 'Pulse should be between 30-200 bpm');
      return;
    }

    if (respNum < 5 || respNum > 50) {
      Alert.alert('Error', 'Respiration should be between 5-50 /min');
      return;
    }

    Alert.alert(
      'TPR Record Saved',
      `Temperature: ${temperature}°C\nPulse: ${pulse} bpm\nRespiration: ${respiration} /min`,
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.patientHeader}>
        <View style={[styles.patientAvatar, { backgroundColor: primaryColor }]}>
          <Ionicons name="person" size={28} color="#fff" />
        </View>
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{patient.name}</Text>
          <Text style={styles.patientMeta}>
            {patient.room} • {patient.age} yrs • {patient.gender}
          </Text>
        </View>
      </View>

      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>TPR Sheet</Text>
        <Text style={styles.sheetSubtitle}>Temperature, Pulse & Respiration Record</Text>
        <View style={styles.sheetDate}>
          <Ionicons name="calendar" size={16} color="#64748b" />
          <Text style={styles.sheetDateText}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>

      <Card style={styles.formCard}>
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="thermometer" size={16} color="#d97706" /> Temperature (°C)
          </Text>
          <TextInput
            style={styles.input}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
            placeholder="36.0 - 38.0"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="heart" size={16} color="#dc2626" /> Pulse (bpm)
          </Text>
          <TextInput
            style={styles.input}
            value={pulse}
            onChangeText={setPulse}
            keyboardType="number-pad"
            placeholder="60 - 100"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="analytics" size={16} color="#7c3aed" /> Respiration (/min)
          </Text>
          <TextInput
            style={styles.input}
            value={respiration}
            onChangeText={setRespiration}
            keyboardType="number-pad"
            placeholder="12 - 20"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="create" size={16} color="#64748b" /> Signature
          </Text>
          <TextInput
            style={[styles.input, styles.signatureInput]}
            value={signature}
            onChangeText={setSignature}
            placeholder="Enter your name and title"
            placeholderTextColor="#94a3b8"
          />
        </View>
      </Card>

      <View style={styles.referenceSection}>
        <Text style={styles.referenceTitle}>Normal Ranges</Text>
        <View style={styles.referenceGrid}>
          <View style={[styles.referenceItem, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="thermometer" size={20} color="#d97706" />
            <Text style={styles.referenceLabel}>Temperature</Text>
            <Text style={styles.referenceValue}>36.0 - 38.0°C</Text>
          </View>
          <View style={[styles.referenceItem, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="heart" size={20} color="#dc2626" />
            <Text style={styles.referenceLabel}>Pulse</Text>
            <Text style={styles.referenceValue}>60 - 100 bpm</Text>
          </View>
          <View style={[styles.referenceItem, { backgroundColor: '#ede9fe' }]}>
            <Ionicons name="analytics" size={20} color="#7c3aed" />
            <Text style={styles.referenceLabel}>Respiration</Text>
            <Text style={styles.referenceValue}>12 - 20 /min</Text>
          </View>
        </View>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>TPR History</Text>
        <Card>
          {[...tprRecords].reverse().slice(0, 5).map((record, index) => (
            <View
              key={record.id}
              style={[
                styles.historyItem,
                index < 4 && styles.historyBorder,
              ]}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyDateTime}>
                  {new Date(record.date).toLocaleDateString()} {record.time}
                </Text>
                {record.temperature > 38 || record.temperature < 36 ? (
                  <Badge label="Fever" variant="danger" size="sm" />
                ) : record.temperature > 37.5 ? (
                  <Badge label="Low Grade" variant="warning" size="sm" />
                ) : (
                  <Badge label="Normal" variant="success" size="sm" />
                )}
              </View>
              <View style={styles.historyValues}>
                <View style={styles.historyValue}>
                  <Ionicons name="thermometer" size={14} color="#d97706" />
                  <Text style={styles.historyValueText}>{record.temperature}°C</Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="heart" size={14} color="#dc2626" />
                  <Text style={styles.historyValueText}>{record.pulse}</Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="analytics" size={14} color="#7c3aed" />
                  <Text style={styles.historyValueText}>{record.respiration}</Text>
                </View>
              </View>
              <Text style={styles.historySignature}>By: {record.signature}</Text>
            </View>
          ))}
        </Card>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Ionicons name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>Save TPR Record</Text>
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    marginLeft: 14,
    flex: 1,
  },
  patientName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  patientMeta: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  sheetHeader: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  sheetDate: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sheetDateText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
  },
  formCard: {
    marginBottom: 20,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  signatureInput: {
    fontSize: 16,
  },
  referenceSection: {
    marginBottom: 20,
  },
  referenceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  referenceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  referenceItem: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  referenceLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
  },
  referenceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  historySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  historyItem: {
    paddingVertical: 12,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyDateTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  historyValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  historyValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyValueText: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 4,
  },
  historySignature: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primaryColor,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
  },
});