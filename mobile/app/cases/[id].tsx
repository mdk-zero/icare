import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, EmptyState, PrimaryButton, SkeletonScreen } from '@/components/ui';
import {
  IvfForm,
  ObservationList,
  TprForm,
  VitalsForm,
  describeIvf,
  describeTpr,
  describeVitals,
} from '@/components/observations/ObservationForms';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchCase, saveCaseDraft, submitCase, type CaseDetail, type CaseDraft, type CaseStatus } from '@/lib/api';
import { INITIALS_PATTERN, filterInitialsInput } from '@/lib/case-privacy';
import { scoreDescriptor, TASK_RATING_BADGE, TASK_RATING_LABEL } from '@/lib/task-ratings';

/**
 * A hospital case write-up: the student's most interesting patient from duty,
 * named by initials only. Drafts save themselves a second after typing stops
 * and again on the way out; handing in freezes the case for grading.
 */

const AUTOSAVE_MS = 1000;

const REQUIRED: [keyof CaseDraft, string][] = [
  ['patient_initials', 'Patient initials'],
  ['age', 'Age'],
  ['sex', 'Sex'],
  ['admitting_diagnosis', 'Admitting diagnosis'],
  ['chief_complaint', 'Chief complaint'],
  ['nursing_diagnoses', 'Nursing diagnoses'],
  ['interventions', 'Interventions'],
];

const STATUS_BADGE: Record<CaseStatus, { label: string; variant: 'default' | 'warning' | 'info' | 'success' }> = {
  not_started: { label: 'Not started', variant: 'default' },
  draft: { label: 'Draft', variant: 'warning' },
  submitted: { label: 'Awaiting grading', variant: 'info' },
  graded: { label: 'Graded', variant: 'success' },
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type OpenForm = 'vitals' | 'tpr' | 'ivf' | null;

function toDraft(c: CaseDetail): CaseDraft {
  return {
    patient_initials: c.patient_initials,
    age: c.age,
    sex: c.sex,
    hospital: c.hospital,
    ward: c.ward,
    admitting_diagnosis: c.admitting_diagnosis,
    chief_complaint: c.chief_complaint,
    history: c.history,
    medications: c.medications,
    nursing_diagnoses: c.nursing_diagnoses,
    interventions: c.interventions,
    observations: c.observations ?? { vitals: [], tpr: [], ivf: [] },
  };
}

function missingFields(d: CaseDraft): string[] {
  return REQUIRED.filter(([key]) => {
    const v = d[key];
    if (key === 'patient_initials') return !(typeof v === 'string' && INITIALS_PATTERN.test(v));
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }).map(([, label]) => label);
}

/** The draft as the server will take it: half-typed initials are held back, not sent. */
function payload(d: CaseDraft, initialsText: string): Partial<CaseDraft> {
  const { patient_initials: _ignored, ...rest } = d;
  if (initialsText === '') return { ...rest, patient_initials: null };
  return INITIALS_PATTERN.test(initialsText) ? { ...rest, patient_initials: initialsText } : rest;
}

export default function CaseEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const caseId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const { data, loading, error, fromCache, reload } = useApiData(() => fetchCase(caseId));

  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [initialsText, setInitialsText] = useState('');
  const [ageText, setAgeText] = useState('');
  const [status, setStatus] = useState<CaseStatus>('not_started');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [submitting, setSubmitting] = useState(false);

  // Refs so the unmount flush and the timer see the latest edit.
  const draftRef = useRef<CaseDraft | null>(null);
  const initialsRef = useRef('');
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);

  // Seed the form once from the server; later reloads must not clobber typing.
  useEffect(() => {
    if (!data || seededRef.current) return;
    seededRef.current = true;
    const d = toDraft(data);
    setDraft(d);
    draftRef.current = d;
    setInitialsText(d.patient_initials ?? '');
    initialsRef.current = d.patient_initials ?? '';
    setAgeText(d.age === null ? '' : String(d.age));
    setStatus(data.status);
  }, [data]);

  const editable = status === 'not_started' || status === 'draft';

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current || !draftRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const saved = await saveCaseDraft(caseId, payload(draftRef.current, initialsRef.current));
      setStatus(saved.status);
      setSaveState('saved');
    } catch (err) {
      dirtyRef.current = true;
      setSaveState('error');
      if (!(err instanceof Error)) return;
      // A handed-in case can't be edited; say why once rather than retrying.
      if (/handed in/i.test(err.message)) {
        dirtyRef.current = false;
        Alert.alert('Case already handed in', err.message);
      }
    }
  }, [caseId]);

  // Save whatever is pending on the way out.
  useEffect(() => () => void flush(), [flush]);

  const update = (patch: Partial<CaseDraft>) => {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    dirtyRef.current = true;
    setSaveState('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const onInitials = (raw: string) => {
    const text = filterInitialsInput(raw);
    setInitialsText(text);
    initialsRef.current = text;
    update({});
  };

  const onAge = (raw: string) => {
    const text = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setAgeText(text);
    const n = text === '' ? null : parseInt(text, 10);
    update({ age: n !== null && n <= 130 ? n : null });
  };

  const handIn = () => {
    if (!draftRef.current) return;
    const missing = missingFields({ ...draftRef.current, patient_initials: initialsRef.current || null });
    if (missing.length > 0) {
      Alert.alert('Almost there', `Fill in before handing in:\n\n• ${missing.join('\n• ')}`);
      return;
    }
    Alert.alert(
      'Hand in your case?',
      'Your instructor grades it from here. You can no longer edit it after handing in.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Hand in',
          onPress: async () => {
            setSubmitting(true);
            try {
              dirtyRef.current = true;
              await flush();
              await submitCase(caseId);
              setStatus('submitted');
              Alert.alert('Handed in', 'Your case was sent to your instructor for grading.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err) {
              Alert.alert('Could not hand in', err instanceof Error ? err.message : 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading && !data) return <SkeletonScreen />;
  if (!data || !draft) {
    return (
      <View style={styles.center}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Case not found'} />
      </View>
    );
  }

  const initialsError =
    initialsText.length > 0 && !INITIALS_PATTERN.test(initialsText) ? 'Use 2–4 letters, like JD for Juan Dela Cruz.' : null;
  const obs = draft.observations;
  const badge = STATUS_BADGE[status];
  const deadline = data.presentation.deadline
    ? new Date(data.presentation.deadline).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  const text = (key: keyof CaseDraft, label: string, placeholder: string, multiline = false) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline, !editable && styles.readOnly]}
        value={(draft[key] as string) ?? ''}
        onChangeText={(v) => update({ [key]: v } as Partial<CaseDraft>)}
        placeholder={editable ? placeholder : '—'}
        placeholderTextColor={Palette.textMuted}
        editable={editable}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{data.presentation.title}</Text>
          <View style={styles.headerRow}>
            <Badge label={badge.label} variant={badge.variant} size="sm" />
            {data.late ? <Badge label="Late" variant="danger" size="sm" /> : null}
            {deadline ? <Text style={styles.caption}>Due {deadline}</Text> : null}
            {editable ? <SaveIndicator state={saveState} styles={styles} /> : null}
          </View>
          {fromCache ? <Text style={styles.caption}>Offline — showing your last synced copy. Edits need a connection.</Text> : null}
          {data.presentation.instructions ? <Text style={styles.instructions}>{data.presentation.instructions}</Text> : null}
        </View>

        {status === 'graded' ? <GradeCard detail={data} styles={styles} /> : null}

        {editable ? (
          <View style={[styles.privacy, { backgroundColor: Accent.amber.bg, borderColor: Accent.amber.border }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Accent.amber.fg} />
            <Text style={[styles.privacyText, { color: Accent.amber.fg }]}>
              Use initials only. Do not write the patient&apos;s name, hospital record number or birthdate anywhere in
              this case.
            </Text>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Patient</Text>
          <View style={styles.row}>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>Initials</Text>
              <TextInput
                style={[styles.input, styles.initials, initialsError && styles.inputError, !editable && styles.readOnly]}
                value={initialsText}
                onChangeText={onInitials}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={4}
                placeholder="JD"
                placeholderTextColor={Palette.textMuted}
                editable={editable}
                accessibilityLabel="Patient initials"
              />
            </View>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={[styles.input, !editable && styles.readOnly]}
                value={ageText}
                onChangeText={onAge}
                keyboardType="number-pad"
                placeholder="Years"
                placeholderTextColor={Palette.textMuted}
                editable={editable}
                accessibilityLabel="Patient age in years"
              />
            </View>
          </View>
          {initialsError ? <Text style={styles.errorText}>{initialsError}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['male', 'female'] as const).map((sex) => {
                const on = draft.sex === sex;
                return (
                  <Pressable
                    key={sex}
                    disabled={!editable}
                    onPress={() => update({ sex })}
                    style={[styles.segmentItem, on && { backgroundColor: Palette.primary, borderColor: Palette.primary }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: !editable }}
                  >
                    <Text style={[styles.segmentText, on && { color: Palette.white }]}>{sex === 'male' ? 'Male' : 'Female'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>{text('hospital', 'Hospital', 'Where you were on duty')}</View>
            <View style={styles.flex}>{text('ward', 'Ward / unit', 'e.g. Medical Ward')}</View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Presentation</Text>
          {text('admitting_diagnosis', 'Admitting diagnosis', 'e.g. Community-acquired pneumonia')}
          {text('chief_complaint', 'Chief complaint', 'In the patient’s words, and for how long', true)}
          {text('history', 'History', 'Past illnesses, surgeries, lifestyle', true)}
          {text('medications', 'Medications', 'One per line: drug, dose, route, frequency', true)}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Nursing care</Text>
          {text('nursing_diagnoses', 'Nursing diagnoses', 'Prioritised, one per line', true)}
          {text('interventions', 'Interventions & rationale', 'What you did and why, for each diagnosis', true)}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Observations</Text>
          <Text style={styles.caption}>What you saw on duty. Optional, but it helps your assessment findings.</Text>

          <ObsSection
            title="Vital signs"
            open={openForm === 'vitals'}
            editable={editable}
            onAdd={() => setOpenForm('vitals')}
            styles={styles}
            form={
              <VitalsForm
                onCancel={() => setOpenForm(null)}
                onSave={(e) => {
                  update({ observations: { ...obs, vitals: [...obs.vitals, e] } });
                  setOpenForm(null);
                }}
              />
            }
            list={
              <ObservationList
                lines={obs.vitals.map(describeVitals)}
                emptyText="No vital signs added."
                onDelete={editable ? (i) => update({ observations: { ...obs, vitals: obs.vitals.filter((_, j) => j !== i) } }) : undefined}
              />
            }
          />
          <ObsSection
            title="TPR"
            open={openForm === 'tpr'}
            editable={editable}
            onAdd={() => setOpenForm('tpr')}
            styles={styles}
            form={
              <TprForm
                onCancel={() => setOpenForm(null)}
                onSave={(e) => {
                  update({ observations: { ...obs, tpr: [...obs.tpr, e] } });
                  setOpenForm(null);
                }}
              />
            }
            list={
              <ObservationList
                lines={obs.tpr.map(describeTpr)}
                emptyText="No TPR readings added."
                onDelete={editable ? (i) => update({ observations: { ...obs, tpr: obs.tpr.filter((_, j) => j !== i) } }) : undefined}
              />
            }
          />
          <ObsSection
            title="IV fluids"
            open={openForm === 'ivf'}
            editable={editable}
            onAdd={() => setOpenForm('ivf')}
            styles={styles}
            form={
              <IvfForm
                onCancel={() => setOpenForm(null)}
                onSave={(e) => {
                  update({ observations: { ...obs, ivf: [...obs.ivf, e] } });
                  setOpenForm(null);
                }}
              />
            }
            list={
              <ObservationList
                lines={obs.ivf.map(describeIvf)}
                emptyText="No IV fluids added."
                onDelete={editable ? (i) => update({ observations: { ...obs, ivf: obs.ivf.filter((_, j) => j !== i) } }) : undefined}
              />
            }
          />
        </Card>

        {editable ? (
          <PrimaryButton title="Hand in for grading" onPress={handIn} loading={submitting} disabled={submitting} size="lg" />
        ) : status === 'submitted' ? (
          <View style={styles.center}>
            <Ionicons name="hourglass-outline" size={20} color={Palette.textMuted} />
            <Text style={styles.caption}>Handed in — waiting for your instructor to grade it.</Text>
            <Pressable onPress={reload} hitSlop={8}>
              <Text style={[styles.caption, { color: Palette.primary }]}>Check again</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SaveIndicator({ state, styles }: { state: SaveState; styles: ReturnType<typeof createStyles> }) {
  if (state === 'idle') return null;
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Not saved — check your connection';
  return <Text style={[styles.caption, state === 'error' && styles.errorText]}>{label}</Text>;
}

function ObsSection({
  title,
  open,
  editable,
  onAdd,
  form,
  list,
  styles,
}: {
  title: string;
  open: boolean;
  editable: boolean;
  onAdd: () => void;
  form: React.ReactNode;
  list: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  const { Palette } = useTheme();
  return (
    <View style={styles.obsSection}>
      <View style={styles.obsHeader}>
        <Text style={styles.label}>{title}</Text>
        {editable && !open ? (
          <Pressable onPress={onAdd} hitSlop={8} style={styles.addButton} accessibilityRole="button" accessibilityLabel={`Add ${title}`}>
            <Ionicons name="add-circle-outline" size={18} color={Palette.primary} />
            <Text style={[styles.caption, { color: Palette.primary, fontWeight: '600' }]}>Add</Text>
          </Pressable>
        ) : null}
      </View>
      {list}
      {open ? form : null}
    </View>
  );
}

function GradeCard({ detail, styles }: { detail: CaseDetail; styles: ReturnType<typeof createStyles> }) {
  const byKey = new Map(detail.ratings.map((r) => [r.criterion, r]));
  const score = detail.score ?? 0;
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Your grade</Text>
      <Text style={styles.score}>
        {score}% · {scoreDescriptor(score)}
      </Text>
      {detail.criteria.map((c) => {
        const r = byKey.get(c.key);
        return (
          <View key={c.key} style={styles.gradeRow}>
            <View style={styles.flex}>
              <Text style={styles.gradeLabel}>{c.label}</Text>
              {r?.remarks ? <Text style={styles.caption}>{r.remarks}</Text> : null}
            </View>
            {r ? <Badge label={TASK_RATING_LABEL[r.rating]} variant={TASK_RATING_BADGE[r.rating]} size="sm" /> : null}
          </View>
        );
      })}
      {detail.remarks ? <Text style={styles.instructions}>“{detail.remarks}”</Text> : null}
    </Card>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 64, gap: Spacing.lg },
    center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
    header: { gap: Spacing.sm },
    headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
    title: Type.title,
    caption: Type.caption,
    instructions: { ...Type.body, fontStyle: 'italic' },
    privacy: {
      flexDirection: 'row',
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    privacyText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    card: { gap: Spacing.md },
    sectionTitle: Type.sectionTitle,
    row: { flexDirection: 'row', gap: Spacing.md },
    flex: { flex: 1 },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      backgroundColor: Palette.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: Palette.ink,
    },
    initials: { fontSize: 18, fontWeight: '700', letterSpacing: 3 },
    multiline: { minHeight: 88, textAlignVertical: 'top' },
    readOnly: { backgroundColor: Palette.surfaceMuted, color: Palette.text },
    inputError: { borderColor: Accent.red.fg },
    errorText: { fontSize: 12, color: Accent.red.fg, marginTop: -6 },
    segment: { flexDirection: 'row', gap: Spacing.sm },
    segmentItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
    },
    segmentText: { fontSize: 14, fontWeight: '600', color: Palette.text },
    obsSection: { gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Palette.borderLight },
    obsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    score: { fontSize: 22, fontWeight: '800', color: Palette.ink },
    gradeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
    gradeLabel: Type.itemTitle,
  });
}
