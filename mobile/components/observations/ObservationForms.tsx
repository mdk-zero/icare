import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { PrimaryButton } from '@/components/ui';
import { VITAL_RULES } from '@/lib/vitals-rules';
import type { CaseIvfEntry, CaseTprEntry, CaseVitalsEntry } from '@/lib/api';

/**
 * Entry forms for what a student observed on hospital duty: vital signs, a TPR
 * reading and an IV fluid. They were the ward chart screens; now they only
 * hand the entry back through onSave, and the case editor keeps the list.
 */

type Styles = ReturnType<typeof createStyles>;

function useStyles() {
  const { Palette, Accent } = useTheme();
  return { styles: React.useMemo(() => createStyles(Palette), [Palette]), Palette, Accent };
}

/** '' → null; anything unparseable → 'invalid'. */
function parseNumber(raw: string, isFloat = false): number | null | 'invalid' {
  if (raw.trim() === '') return null;
  const n = isFloat ? parseFloat(raw) : parseInt(raw, 10);
  return Number.isNaN(n) ? 'invalid' : n;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  decimal,
  multiline,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  decimal?: boolean;
  multiline?: boolean;
  styles: Styles;
}) {
  const { Palette } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Palette.textMuted}
        keyboardType={decimal ? 'decimal-pad' : numeric ? 'number-pad' : 'default'}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

function FormActions({ onSave, onCancel, styles }: { onSave: () => void; onCancel: () => void; styles: Styles }) {
  return (
    <View style={styles.actions}>
      <PrimaryButton title="Cancel" variant="outline" size="sm" onPress={onCancel} style={styles.actionButton} />
      <PrimaryButton title="Add entry" size="sm" onPress={onSave} style={styles.actionButton} />
    </View>
  );
}

export function VitalsForm({ onSave, onCancel }: { onSave: (e: CaseVitalsEntry) => void; onCancel: () => void }) {
  const { styles } = useStyles();
  const [v, setV] = useState({ hr: '', sys: '', dia: '', temp: '', rr: '', spo2: '', pain: '', notes: '' });
  const set = (key: keyof typeof v) => (text: string) => setV((prev) => ({ ...prev, [key]: text }));

  const save = () => {
    const values = {
      heart_rate: parseNumber(v.hr),
      bp_systolic: parseNumber(v.sys),
      bp_diastolic: parseNumber(v.dia),
      temperature_c: parseNumber(v.temp, true),
      respiratory_rate: parseNumber(v.rr),
      oxygen_saturation: parseNumber(v.spo2),
      pain_score: parseNumber(v.pain),
    };
    if (Object.values(values).some((x) => x === 'invalid')) return Alert.alert('Check the values', 'Please enter valid numbers.');
    if (Object.values(values).every((x) => x === null)) return Alert.alert('Nothing to add', 'Enter at least one vital sign.');
    for (const rule of VITAL_RULES) {
      const value = values[rule.field as keyof typeof values];
      if (typeof value === 'number' && (value < rule.min || value > rule.max)) {
        return Alert.alert('Check the values', `${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.`);
      }
    }
    if (typeof values.pain_score === 'number' && (values.pain_score < 0 || values.pain_score > 10)) {
      return Alert.alert('Check the values', 'Pain score must be between 0 and 10.');
    }
    onSave({ ...(values as Omit<CaseVitalsEntry, 'notes' | 'observed_at'>), notes: v.notes.trim(), observed_at: new Date().toISOString() });
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <Field label="Heart rate (bpm)" value={v.hr} onChangeText={set('hr')} placeholder="60–100" numeric styles={styles} />
        <Field label="Temp (°C)" value={v.temp} onChangeText={set('temp')} placeholder="36.5" decimal styles={styles} />
      </View>
      <View style={styles.row}>
        <Field label="BP systolic" value={v.sys} onChangeText={set('sys')} placeholder="120" numeric styles={styles} />
        <Field label="BP diastolic" value={v.dia} onChangeText={set('dia')} placeholder="80" numeric styles={styles} />
      </View>
      <View style={styles.row}>
        <Field label="Resp. rate (/min)" value={v.rr} onChangeText={set('rr')} placeholder="12–20" numeric styles={styles} />
        <Field label="SpO₂ (%)" value={v.spo2} onChangeText={set('spo2')} placeholder="95–100" numeric styles={styles} />
      </View>
      <View style={styles.row}>
        <Field label="Pain (0–10)" value={v.pain} onChangeText={set('pain')} placeholder="0" numeric styles={styles} />
        <View style={styles.field} />
      </View>
      <Field label="Notes" value={v.notes} onChangeText={set('notes')} placeholder="Optional" styles={styles} />
      <FormActions onSave={save} onCancel={onCancel} styles={styles} />
    </View>
  );
}

export function TprForm({ onSave, onCancel }: { onSave: (e: CaseTprEntry) => void; onCancel: () => void }) {
  const { styles } = useStyles();
  const [temp, setTemp] = useState('');
  const [pulse, setPulse] = useState('');
  const [resp, setResp] = useState('');
  const [remarks, setRemarks] = useState('');

  const save = () => {
    const t = parseNumber(temp, true);
    const p = parseNumber(pulse);
    const r = parseNumber(resp);
    if ([t, p, r].some((x) => x === 'invalid')) return Alert.alert('Check the values', 'Please enter valid numbers.');
    if (t === null && p === null && r === null) {
      return Alert.alert('Nothing to add', 'Enter at least one of temperature, pulse or respiration.');
    }
    if (typeof t === 'number' && (t < 30 || t > 45)) return Alert.alert('Check the values', 'Temperature should be 30–45 °C.');
    if (typeof p === 'number' && (p < 30 || p > 200)) return Alert.alert('Check the values', 'Pulse should be 30–200 bpm.');
    if (typeof r === 'number' && (r < 5 || r > 50)) return Alert.alert('Check the values', 'Respiration should be 5–50 /min.');
    onSave({
      temperature_c: t as number | null,
      pulse: p as number | null,
      respiration: r as number | null,
      remarks: remarks.trim(),
      observed_at: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <Field label="Temp (°C)" value={temp} onChangeText={setTemp} placeholder="36.5" decimal styles={styles} />
        <Field label="Pulse (bpm)" value={pulse} onChangeText={setPulse} placeholder="60–100" numeric styles={styles} />
        <Field label="Resp. (/min)" value={resp} onChangeText={setResp} placeholder="12–20" numeric styles={styles} />
      </View>
      <Field label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="e.g. AM shift" styles={styles} />
      <FormActions onSave={save} onCancel={onCancel} styles={styles} />
    </View>
  );
}

export function IvfForm({ onSave, onCancel }: { onSave: (e: CaseIvfEntry) => void; onCancel: () => void }) {
  const { styles } = useStyles();
  const [solution, setSolution] = useState('');
  const [volume, setVolume] = useState('');
  const [rate, setRate] = useState('');
  const [site, setSite] = useState('');
  const [remarks, setRemarks] = useState('');

  const save = () => {
    if (!solution.trim()) return Alert.alert('Missing solution', 'Enter the IV solution, e.g. PNSS 1L or D5LR.');
    const vol = parseNumber(volume);
    const r = parseNumber(rate);
    if (vol === 'invalid' || r === 'invalid' || (vol !== null && vol <= 0) || (r !== null && r <= 0)) {
      return Alert.alert('Check the values', 'Volume and rate must be positive numbers.');
    }
    onSave({
      solution: solution.trim(),
      volume_ml: vol,
      rate_ml_hr: r,
      site: site.trim(),
      remarks: remarks.trim(),
      observed_at: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.form}>
      <Field label="Solution" value={solution} onChangeText={setSolution} placeholder="e.g. PNSS 1L, D5LR 500 mL" styles={styles} />
      <View style={styles.row}>
        <Field label="Volume (mL)" value={volume} onChangeText={setVolume} placeholder="1000" numeric styles={styles} />
        <Field label="Rate (mL/hr)" value={rate} onChangeText={setRate} placeholder="120" numeric styles={styles} />
      </View>
      <Field label="Site" value={site} onChangeText={setSite} placeholder="e.g. Left metacarpal vein" styles={styles} />
      <Field label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Optional" styles={styles} />
      <FormActions onSave={save} onCancel={onCancel} styles={styles} />
    </View>
  );
}

/** One line per saved entry, with a delete button while the case is editable. */
export function ObservationList({
  lines,
  onDelete,
  emptyText,
}: {
  lines: string[];
  onDelete?: (index: number) => void;
  emptyText: string;
}) {
  const { styles, Palette } = useStyles();
  if (lines.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  return (
    <View style={styles.list}>
      {lines.map((line, i) => (
        <View key={i} style={styles.listRow}>
          <Text style={styles.listText}>{line}</Text>
          {onDelete ? (
            <Pressable
              onPress={() => onDelete(i)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Delete entry"
            >
              <Ionicons name="trash-outline" size={17} color={Palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const dash = (v: number | null, unit = '') => (v === null ? null : `${v}${unit}`);
const join = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

export const describeVitals = (e: CaseVitalsEntry) =>
  join([
    dash(e.heart_rate, ' bpm'),
    e.bp_systolic != null && e.bp_diastolic != null ? `BP ${e.bp_systolic}/${e.bp_diastolic}` : null,
    dash(e.temperature_c, ' °C'),
    e.respiratory_rate != null ? `RR ${e.respiratory_rate}` : null,
    e.oxygen_saturation != null ? `SpO₂ ${e.oxygen_saturation}%` : null,
    e.pain_score != null ? `pain ${e.pain_score}/10` : null,
  ]);

export const describeTpr = (e: CaseTprEntry) =>
  join([dash(e.temperature_c, ' °C'), e.pulse != null ? `P ${e.pulse}` : null, e.respiration != null ? `R ${e.respiration}` : null, e.remarks || null]);

export const describeIvf = (e: CaseIvfEntry) =>
  join([e.solution, dash(e.volume_ml, ' mL'), e.rate_ml_hr != null ? `${e.rate_ml_hr} mL/hr` : null, e.site || null]);

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    form: {
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: Radius.md,
      backgroundColor: Palette.surfaceMuted,
      borderWidth: 1,
      borderColor: Palette.border,
    },
    row: { flexDirection: 'row', gap: Spacing.sm },
    field: { flex: 1, gap: 4 },
    label: { fontSize: 12, fontWeight: '600', color: Palette.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.sm,
      backgroundColor: Palette.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      fontSize: 15,
      color: Palette.ink,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: 4 },
    actionButton: { minWidth: 110 },
    list: { gap: 6 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: Radius.sm,
      backgroundColor: Palette.surfaceMuted,
    },
    listText: { flex: 1, fontSize: 13, color: Palette.text },
    empty: { fontSize: 13, color: Palette.textMuted },
  });
}
