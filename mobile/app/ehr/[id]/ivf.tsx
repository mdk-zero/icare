import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { Card } from '@/components/ui';
import { mockPatients, getIVFForPatient } from '@/lib/mocks';

const primaryColor = Palette.primary;

export default function IVFSheetScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const patientId = id as string;

  const patient = mockPatients.find((p) => p.id === patientId);
  const ivfRecords = getIVFForPatient(patientId);

  const latestIVF = ivfRecords.length > 0 ? ivfRecords[ivfRecords.length - 1] : null;

  const [ivFluids, setIvFluids] = useState(latestIVF?.ivFluids?.toString() || '500');
  const [oralIntake, setOralIntake] = useState(latestIVF?.oralIntake?.toString() || '200');
  const [urineOutput, setUrineOutput] = useState(latestIVF?.urineOutput?.toString() || '300');
  const [vomitus, setVomitus] = useState(latestIVF?.vomitus?.toString() || '0');
  const [drainage, setDrainage] = useState(latestIVF?.drainage?.toString() || '0');
  const [heartRate, setHeartRate] = useState(latestIVF?.heartRate?.toString() || '72');
  const [bpSystolic, setBpSystolic] = useState(latestIVF?.bloodPressureSystolic?.toString() || '120');
  const [bpDiastolic, setBpDiastolic] = useState(latestIVF?.bloodPressureDiastolic?.toString() || '80');
  const [temperature, setTemperature] = useState(latestIVF?.temperature?.toString() || '37.0');
  const [notes, setNotes] = useState(latestIVF?.notes || '');
  const [signature, setSignature] = useState(latestIVF?.signature || '');

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Patient not found</Text>
      </View>
    );
  }

  const totalIntake = (parseInt(ivFluids) || 0) + (parseInt(oralIntake) || 0);
  const totalOutput = (parseInt(urineOutput) || 0) + (parseInt(vomitus) || 0) + (parseInt(drainage) || 0);
  const balance = totalIntake - totalOutput;

  const handleSave = () => {
    const tempNum = parseFloat(temperature);
    const hrNum = parseInt(heartRate);
    const sysNum = parseInt(bpSystolic);
    const diaNum = parseInt(bpDiastolic);

    if (isNaN(tempNum) || isNaN(hrNum) || isNaN(sysNum) || isNaN(diaNum)) {
      Alert.alert('Error', 'Please enter valid numeric values');
      return;
    }

    if (tempNum < 30 || tempNum > 45) {
      Alert.alert('Error', 'Temperature should be between 30-45°C');
      return;
    }

    if (hrNum < 30 || hrNum > 200) {
      Alert.alert('Error', 'Heart rate should be between 30-200 bpm');
      return;
    }

    Alert.alert(
      'IVF Record Saved',
      `Intake: ${totalIntake}ml\nOutput: ${totalOutput}ml\nBalance: ${balance}ml`,
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
        <Text style={styles.sheetTitle}>IVF Sheet</Text>
        <Text style={styles.sheetSubtitle}>Intake-Output & Vital Signs Flow Record</Text>
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
        <Text style={styles.sectionTitle}>
          <Ionicons name="water" size={18} color="#0891b2" /> Intake
        </Text>
        
        <View style={styles.row}>
          <View style={[styles.inputHalf, { marginRight: 8 }]}>
            <Text style={styles.inputLabel}>IV Fluids (ml)</Text>
            <TextInput
              style={styles.input}
              value={ivFluids}
              onChangeText={setIvFluids}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={[styles.inputHalf, { marginLeft: 8 }]}>
            <Text style={styles.inputLabel}>Oral (ml)</Text>
            <TextInput
              style={styles.input}
              value={oralIntake}
              onChangeText={setOralIntake}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          <Ionicons name="water" size={18} color="#dc2626" /> Output
        </Text>
        
        <View style={styles.row}>
          <View style={[styles.inputHalf, { marginRight: 8 }]}>
            <Text style={styles.inputLabel}>Urine (ml)</Text>
            <TextInput
              style={styles.input}
              value={urineOutput}
              onChangeText={setUrineOutput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={[styles.inputHalf, { marginLeft: 8 }]}>
            <Text style={styles.inputLabel}>Vomitus (ml)</Text>
            <TextInput
              style={styles.input}
              value={vomitus}
              onChangeText={setVomitus}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Drainage (ml)</Text>
          <TextInput
            style={styles.input}
            value={drainage}
            onChangeText={setDrainage}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.balanceSection}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Total Intake</Text>
            <Text style={[styles.balanceValue, { color: primaryColor }]}>{totalIntake} ml</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Total Output</Text>
            <Text style={[styles.balanceValue, { color: Accent.red.fg }]}>{totalOutput} ml</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={[
              styles.balanceValue,
              { color: balance >= 0 ? Accent.green.fg : Accent.red.fg }
            ]}>
              {balance} ml
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.formCard}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="heart" size={18} color="#dc2626" /> Vital Signs
        </Text>

        <View style={styles.row}>
          <View style={[styles.inputHalf, { marginRight: 8 }]}>
            <Text style={styles.inputLabel}>
              <Ionicons name="heart" size={14} color="#dc2626" /> HR (bpm)
            </Text>
            <TextInput
              style={styles.input}
              value={heartRate}
              onChangeText={setHeartRate}
              keyboardType="number-pad"
              placeholder="60-100"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={[styles.inputHalf, { marginLeft: 8 }]}>
            <Text style={styles.inputLabel}>
              <Ionicons name="thermometer" size={14} color="#d97706" /> Temp (°C)
            </Text>
            <TextInput
              style={styles.input}
              value={temperature}
              onChangeText={setTemperature}
              keyboardType="decimal-pad"
              placeholder="36-38"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            <Ionicons name="speedometer" size={14} color="#7c3aed" /> Blood Pressure
          </Text>
          <View style={styles.bpRow}>
            <TextInput
              style={[styles.input, styles.bpInput]}
              value={bpSystolic}
              onChangeText={setBpSystolic}
              keyboardType="number-pad"
              placeholder="120"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.bpSeparator}>/</Text>
            <TextInput
              style={[styles.input, styles.bpInput]}
              value={bpDiastolic}
              onChangeText={setBpDiastolic}
              keyboardType="number-pad"
              placeholder="80"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.bpUnit}>mmHg</Text>
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Enter clinical notes..."
            placeholderTextColor="#94a3b8"
            multiline
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Signature</Text>
          <TextInput
            style={[styles.input, styles.signatureInput]}
            value={signature}
            onChangeText={setSignature}
            placeholder="Enter your name and title"
            placeholderTextColor="#94a3b8"
          />
        </View>
      </Card>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>IVF History</Text>
        <Card>
          {[...ivfRecords].reverse().slice(0, 5).map((record, index) => (
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
              </View>
              <View style={styles.historyValues}>
                <View style={styles.historyValue}>
                  <Ionicons name="water" size={14} color="#0891b2" />
                  <Text style={styles.historyValueText}>
                    In: {(record.ivFluids + record.oralIntake)}ml
                  </Text>
                </View>
                <View style={styles.historyValue}>
                  <Ionicons name="water" size={14} color="#dc2626" />
                  <Text style={styles.historyValueText}>
                    Out: {(record.urineOutput + record.vomitus + record.drainage)}ml
                  </Text>
                </View>
              </View>
              <Text style={styles.historySignature}>By: {record.signature}</Text>
            </View>
          ))}
        </Card>
      </View>

      <Pressable style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.85 }]} onPress={handleSave}>
        <Ionicons name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>Save IVF Record</Text>
      </Pressable>
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
    paddingBottom: 40,
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
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
    color: Palette.ink,
  },
  patientMeta: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  sheetHeader: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  sheetTitle: {
    ...Type.screenTitle,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginTop: 4,
  },
  sheetDate: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  sheetDateText: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginLeft: 8,
  },
  formCard: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Type.sectionTitle,
    color: Palette.text,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  inputHalf: {
    flex: 1,
  },
  inputSection: {
    marginTop: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 18,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: Palette.border,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  signatureInput: {
    fontSize: 16,
  },
  balanceSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  balanceItem: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  bpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bpInput: {
    flex: 1,
    textAlign: 'center',
  },
  bpSeparator: {
    fontSize: 20,
    fontWeight: '600',
    color: Palette.textSecondary,
    marginHorizontal: 8,
  },
  bpUnit: {
    fontSize: 14,
    color: Palette.textSecondary,
    marginLeft: 8,
  },
  historySection: {
    marginBottom: Spacing.xl,
  },
  historyItem: {
    paddingVertical: 12,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
  },
  historyHeader: {
    marginBottom: 8,
  },
  historyDateTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
  },
  historyValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  historyValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyValueText: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  historySignature: {
    fontSize: 11,
    color: Palette.textMuted,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primaryColor,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: Spacing.sm,
    ...Shadow.raised,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8,
  },
});