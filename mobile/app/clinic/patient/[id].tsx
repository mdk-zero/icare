import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, PrimaryButton, SkeletonScreen, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import {
  fetchWard,
  fetchEhrRecords,
  fetchScenarioTasks,
  createEhrRecord,
  submitScenarioAssignment,
  EhrRecord,
  ScenarioTask,
  ScenarioTasksResult,
  WardVitals,
} from '@/lib/api';
import { isNetworkError } from '@/lib/client';

/**
 * The patient hub — the end of the ward walk-through and the only place a
 * student charts. It carries the scenario brief, the task checklist, the four
 * record actions (vitals, TPR, IVF, progress note) and the hand-in, so the
 * whole clinical loop closes on the patient rather than in a separate runner.
 *
 * A patient outside the student's scenarios stops at a read-only summary; the
 * server would refuse the write anyway (isPatientAssigned), this just says so
 * before the round trip.
 */

type HistoryEntry = { kind: 'tpr' | 'ivf'; record: EhrRecord };

const IVF_STATUS_VARIANT: Record<string, 'info' | 'success' | 'warning'> = {
  ongoing: 'info',
  completed: 'success',
  discontinued: 'warning',
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function VitalsGrid({
  vitals,
  styles,
}: {
  vitals: WardVitals;
  styles: ReturnType<typeof createStyles>;
}) {
  const cells = [
    { label: 'HR', value: vitals.heart_rate, unit: 'bpm' },
    {
      label: 'BP',
      value:
        vitals.bp_systolic != null && vitals.bp_diastolic != null
          ? `${vitals.bp_systolic}/${vitals.bp_diastolic}`
          : null,
      unit: 'mmHg',
    },
    { label: 'Temp', value: vitals.temperature_c, unit: '°C' },
    { label: 'SpO₂', value: vitals.oxygen_saturation, unit: '%' },
  ];
  return (
    <View style={styles.vitalsGrid}>
      {cells.map((cell) => (
        <View key={cell.label} style={styles.vitalCell}>
          <Text style={styles.vitalLabel}>{cell.label}</Text>
          <Text style={styles.vitalValue}>{cell.value ?? '—'}</Text>
          <Text style={styles.vitalUnit}>{cell.unit}</Text>
        </View>
      ))}
    </View>
  );
}

function RecordButton({
  label,
  icon,
  accent,
  styles,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: { fg: string; bg: string };
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Record ${label}`}
    >
      <View style={[styles.recordIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={icon} size={20} color={accent.fg} />
      </View>
      <Text style={styles.recordLabel}>{label}</Text>
    </Pressable>
  );
}

export default function PatientHubScreen() {
  const { id } = useLocalSearchParams();
  const patientId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchWard);

  const patient = data?.patients.find((p) => p.id === patientId) ?? null;
  // An open assignment wins over a finalized one for the same patient.
  const assignments = React.useMemo(
    () => (data?.assignments ?? []).filter((a) => a.patient_id === patientId),
    [data, patientId],
  );
  const assignment = assignments.find((a) => a.status !== 'completed') ?? assignments[0] ?? null;
  const assignmentId = assignment?.id ?? null;
  const isAssigned = Boolean(patient?.is_assigned && assignmentId);

  const [chart, setChart] = React.useState<{ tpr: EhrRecord[]; ivf: EhrRecord[]; notes: EhrRecord[] } | null>(null);
  const [taskResult, setTaskResult] = React.useState<ScenarioTasksResult | null>(null);
  const [chartError, setChartError] = React.useState<string | null>(null);

  // Depends on the assignment *id*, not the object, so re-pulling the ward
  // cannot retrigger this and loop.
  const loadChart = React.useCallback(async () => {
    if (!assignmentId) return;
    try {
      const [tpr, ivf, notes, tasks] = await Promise.all([
        fetchEhrRecords('tpr', patientId),
        fetchEhrRecords('ivf', patientId),
        fetchEhrRecords('note', patientId),
        fetchScenarioTasks(assignmentId),
      ]);
      setChart({ tpr: tpr.data, ivf: ivf.data, notes: notes.data });
      setTaskResult(tasks.data);
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Unable to load this patient’s records');
    }
  }, [assignmentId, patientId]);

  // Charting auto-checks the matching system tasks, so everything is stale on
  // the way back from a record screen.
  useFocusEffect(
    React.useCallback(() => {
      reload();
      loadChart();
    }, [reload, loadChart]),
  );

  const [note, setNote] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const noteInputRef = React.useRef<TextInput>(null);
  const focusNote = React.useCallback(() => noteInputRef.current?.focus(), []);

  const tasks = taskResult?.tasks ?? [];
  const status = taskResult?.assignment.status ?? assignment?.status ?? 'pending';
  const submittedAt = taskResult?.assignment.submitted_at ?? assignment?.submitted_at ?? null;
  const isFinalized = status === 'completed';
  const isSubmitted = !isFinalized && Boolean(submittedAt);
  const isActive = isAssigned && !isFinalized && !isSubmitted;

  React.useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const handleAddNote = async () => {
    const content = note.trim();
    if (!content) return;
    setSavingNote(true);
    try {
      const result = await createEhrRecord('note', patientId, { content });
      setNote('');
      if (result.queued) {
        Alert.alert(
          'Saved Offline',
          'No connection right now — the progress note is queued and will sync automatically.',
        );
      } else {
        await loadChart();
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to save the note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSubmit = () => {
    if (!assignmentId) return;
    const autoPending = tasks.filter((t) => t.verification === 'system' && !t.is_completed).length;
    Alert.alert(
      'Submit for Review',
      autoPending > 0
        ? `${autoPending} automatic task${autoPending === 1 ? '' : 's'} (record vitals / chart) ${autoPending === 1 ? 'is' : 'are'} still not done. Submit anyway? Your instructor verifies the hands-on tasks and finalizes your score.`
        : 'Submit your work for faculty review? Your instructor verifies the remaining hands-on tasks and finalizes your score.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitScenarioAssignment(assignmentId, elapsed);
              await Promise.all([reload(), loadChart()]);
            } catch (err) {
              Alert.alert(
                'Submission failed',
                isNetworkError(err)
                  ? 'No connection — try again when you are back online.'
                  : err instanceof Error
                    ? err.message
                    : 'Unable to submit',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  const history: HistoryEntry[] = [
    ...(chart?.tpr ?? []).map((record) => ({ kind: 'tpr' as const, record })),
    ...(chart?.ivf ?? []).map((record) => ({ kind: 'ivf' as const, record })),
  ]
    .sort((a, b) => new Date(b.record.created_at).getTime() - new Date(a.record.created_at).getTime())
    .slice(0, 6);

  const vitals = patient.latest_vitals ?? null;
  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const earnedPoints = tasks.filter((t) => t.is_completed).reduce((sum, t) => sum + t.points, 0);


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.patientHeader}>
        <View style={[styles.patientAvatar, { backgroundColor: isAssigned ? Palette.primary : Palette.textFaint }]}>
          <Ionicons name="person" size={28} color="#fff" />
        </View>
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{patient.name}</Text>
          <Text style={styles.patientMeta}>
            {patient.room_number ? patient.room_number : 'No room'} ·{' '}
            {patient.age !== null ? `${patient.age} yrs` : 'Age —'} · {patient.gender ?? '—'}
          </Text>
        </View>
      </View>

      {!isAssigned ? (
        <Card style={styles.blockCard}>
          <View style={styles.viewOnlyHeader}>
            <Ionicons name="lock-closed-outline" size={18} color={Palette.textMuted} />
            <Text style={styles.viewOnlyTitle}>View only</Text>
          </View>
          <Text style={styles.viewOnlyBody}>
            This patient is not part of a scenario assigned to you, so you cannot chart on them. Your
            instructor assigns the patient you are responsible for.
          </Text>
        </Card>
      ) : (
        <>
          <Card style={styles.scenarioCard}>
            <View style={styles.scenarioHeader}>
              <Badge
                label={isFinalized ? 'Completed' : isSubmitted ? 'Awaiting Review' : status === 'overdue' ? 'Overdue' : status === 'in_progress' ? 'In Progress' : 'Pending'}
                variant={isFinalized ? 'success' : isSubmitted ? 'info' : status === 'overdue' ? 'danger' : status === 'in_progress' ? 'warning' : 'default'}
              />
              {assignment?.difficulty ? <Badge label={assignment.difficulty} size="sm" /> : null}
            </View>
            <Text style={styles.scenarioTitle}>{assignment?.scenario_title}</Text>
            <Text style={styles.scenarioMeta}>
              {assignment?.deadline
                ? `Due ${new Date(assignment.deadline).toLocaleString()}`
                : 'No deadline'}
            </Text>

            {isFinalized ? (
              <View style={styles.resultRow}>
                <View style={styles.resultStat}>
                  <Text style={styles.resultValue}>{taskResult?.assignment.score ?? assignment?.score ?? '—'}%</Text>
                  <Text style={styles.resultLabel}>Score</Text>
                </View>
                <View style={styles.resultStat}>
                  <Text style={styles.resultValue}>{formatDuration(taskResult?.assignment.time_taken ?? 0)}</Text>
                  <Text style={styles.resultLabel}>Time</Text>
                </View>
              </View>
            ) : (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${tasks.length ? (completedCount / tasks.length) * 100 : 0}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {completedCount}/{tasks.length} tasks · {earnedPoints}/{totalPoints} pts
                  {isActive ? ` · ${formatDuration(elapsed)}` : ''}
                </Text>
              </View>
            )}

            {assignment?.description ? (
              <Text style={styles.scenarioDescription}>{assignment.description}</Text>
            ) : null}

            {Array.isArray(assignment?.learning_objectives) && assignment.learning_objectives.length > 0 ? (
              <View style={styles.objectives}>
                {assignment.learning_objectives.map((objective, idx) => (
                  <View key={idx} style={styles.objectiveRow}>
                    <Ionicons name="school-outline" size={14} color={Palette.primary} />
                    <Text style={styles.objectiveText}>{String(objective)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {isSubmitted ? (
            <Card style={styles.reviewCard}>
              <Ionicons name="hourglass-outline" size={20} color={Accent.blue.fg} />
              <View style={styles.reviewText}>
                <Text style={styles.reviewTitle}>Submitted for review</Text>
                <Text style={styles.reviewBody}>
                  Your instructor is verifying the hands-on tasks. Your score is finalized once they confirm.
                </Text>
              </View>
            </Card>
          ) : null}

          <Text style={styles.sectionTitle}>Latest Vitals</Text>
          <Card style={styles.blockCard}>
            {vitals ? (
              <>
                <VitalsGrid vitals={vitals} styles={styles} />
                {vitals.is_anomaly ? (
                  <View style={styles.anomalyAlert}>
                    <Ionicons name="warning" size={14} color={Accent.red.fg} />
                    <View style={styles.anomalyBody}>
                      <Text style={styles.anomalyText}>
                        {vitals.anomaly_reasons?.[0]?.message ?? 'Anomaly detected'}
                      </Text>
                      {vitals.anomaly_reasons?.[0]?.recommendation ? (
                        <Text style={styles.anomalyAdvice}>{vitals.anomaly_reasons[0].recommendation}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <Text style={styles.vitalsTime}>Recorded {formatTimestamp(vitals.recorded_at)}</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>No vitals recorded for this patient yet</Text>
            )}
          </Card>

          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Record</Text>
          <Text style={styles.recordHint}>
            Recording vitals or charting here automatically checks off the matching tasks below.
          </Text>
          <View style={styles.recordRow}>
            <RecordButton
              label="Vitals"
              icon="pulse-outline"
              accent={Accent.red}
              styles={styles}
              onPress={() => router.push(`/clinic/patient/${patientId}/vitals`)}
            />
            <RecordButton
              label="TPR"
              icon="thermometer-outline"
              accent={Accent.amber}
              styles={styles}
              onPress={() => router.push(`/clinic/patient/${patientId}/tpr`)}
            />
            <RecordButton
              label="IVF"
              icon="water-outline"
              accent={Accent.cyan}
              styles={styles}
              onPress={() => router.push(`/clinic/patient/${patientId}/ivf`)}
            />
            <RecordButton
              label="Note"
              icon="create-outline"
              accent={Accent.violet}
              styles={styles}
              onPress={focusNote}
            />
          </View>

          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Clinical Tasks</Text>
          <Card style={styles.blockCard}>
            {chartError ? <Text style={styles.emptyText}>{chartError}</Text> : null}
            {!chartError && tasks.length === 0 ? (
              <Text style={styles.emptyText}>No tasks have been set for this scenario yet.</Text>
            ) : null}
            {tasks.map((task: ScenarioTask) => (
              <View key={task.id} style={styles.checkRow}>
                <Ionicons
                  name={task.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={task.is_completed ? Accent.green.fg : Palette.textMuted}
                />
                <View style={styles.checkText}>
                  <View style={styles.checkTitleRow}>
                    <Text style={[styles.checkTitle, task.is_completed && styles.checkTitleDone]}>
                      {task.title}
                    </Text>
                    <Badge
                      label={task.verification === 'system' ? 'Auto' : 'Faculty'}
                      variant={task.verification === 'system' ? 'info' : 'default'}
                      size="sm"
                    />
                  </View>
                  <Text style={styles.checkDescription}>{task.description}</Text>
                  {task.is_completed ? (
                    <Text style={[styles.checkHint, { color: Accent.green.fg }]}>
                      {task.completed_via === 'system' ? 'Auto-completed' : 'Verified by faculty'}
                    </Text>
                  ) : task.verification === 'system' ? (
                    <Text style={[styles.checkHint, { color: Accent.blue.fg }]}>
                      {task.system_trigger === 'vitals'
                        ? 'Completes when you record vitals for this patient'
                        : 'Completes when you chart in the patient record'}
                    </Text>
                  ) : (
                    <Text style={styles.checkHint}>Your instructor verifies this</Text>
                  )}
                </View>
                <Text style={styles.checkPoints}>{task.points} pts</Text>
              </View>
            ))}
          </Card>

          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Record History</Text>
          {history.length > 0 ? (
            <Card style={styles.blockCard}>
              {history.map((entry, index) => {
                const { record } = entry;
                const isTpr = entry.kind === 'tpr';
                const accent = isTpr ? Accent.amber : Accent.cyan;
                const parts: string[] = [];
                if (isTpr) {
                  if (record.temperature_c != null) parts.push(`${record.temperature_c}°C`);
                  if (record.pulse != null) parts.push(`P ${record.pulse}`);
                  if (record.respiration != null) parts.push(`R ${record.respiration}`);
                } else {
                  if (record.volume_ml != null) parts.push(`${record.volume_ml} ml`);
                  if (record.rate_ml_hr != null) parts.push(`${record.rate_ml_hr} ml/hr`);
                  if (record.site) parts.push(record.site);
                }
                return (
                  <View
                    key={`${entry.kind}-${record.id}`}
                    style={[styles.historyItem, index < history.length - 1 && styles.historyBorder]}
                  >
                    <View style={[styles.historyIcon, { backgroundColor: accent.bg }]}>
                      <Ionicons
                        name={isTpr ? 'thermometer-outline' : 'water-outline'}
                        size={16}
                        color={accent.fg}
                      />
                    </View>
                    <View style={styles.historyBody}>
                      <View style={styles.historyTopRow}>
                        <Text style={styles.historyTitle}>{isTpr ? 'TPR' : (record.solution ?? 'IVF')}</Text>
                        {!isTpr && (
                          <Badge
                            label={record.status ?? 'ongoing'}
                            variant={IVF_STATUS_VARIANT[record.status ?? 'ongoing'] ?? 'info'}
                            size="sm"
                          />
                        )}
                      </View>
                      <Text style={styles.historyValues}>{parts.join('  ·  ') || 'No values recorded'}</Text>
                      <Text style={styles.historyTime}>{formatTimestamp(record.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card style={styles.blockCard}>
              <Text style={styles.emptyText}>No TPR or IVF entries charted for this patient yet</Text>
            </Card>
          )}

          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Progress Notes</Text>
          <Card style={styles.composer}>
            <TextInput
              ref={noteInputRef}
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Add a progress note for this patient…"
              placeholderTextColor={Palette.textMuted}
              multiline
              editable={!savingNote}
            />
            <Pressable
              style={({ pressed }) => [
                styles.noteButton,
                (!note.trim() || savingNote) && styles.noteButtonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleAddNote}
              disabled={!note.trim() || savingNote}
            >
              {savingNote ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.noteButtonText}>Save note</Text>
                </>
              )}
            </Pressable>
          </Card>

          {(chart?.notes ?? []).length > 0 ? (
            (chart?.notes ?? []).map((record) => (
              <Card key={record.id} style={styles.recordCard}>
                <View style={styles.recordCardHeader}>
                  <View
                    style={[
                      styles.recordType,
                      { backgroundColor: record.reviewed_at ? Accent.green.bg : Accent.amber.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.recordTypeText,
                        { color: record.reviewed_at ? Accent.green.fg : Accent.amber.fg },
                      ]}
                    >
                      {record.reviewed_at ? 'REVIEWED' : 'PENDING REVIEW'}
                    </Text>
                  </View>
                  <Text style={styles.recordDate}>{new Date(record.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.recordContent}>{record.content}</Text>
              </Card>
            ))
          ) : (
            <Card style={styles.blockCard}>
              <Text style={styles.emptyText}>No progress notes for this patient yet</Text>
            </Card>
          )}

          {/* The help flag belongs where the student is working, not buried in
              settings — this is the ERD's assistance request. */}
          {isActive ? (
            <Pressable
              style={({ pressed }) => [styles.assistButton, pressed && styles.pressed]}
              onPress={() => router.push('/assistance')}
            >
              <Ionicons name="hand-left-outline" size={16} color={Accent.amber.fg} />
              <Text style={styles.assistText}>Request instructor assistance</Text>
            </Pressable>
          ) : null}

          {isActive ? (
            <PrimaryButton
              title={submitting ? 'Submitting…' : 'Submit for Review'}
              onPress={handleSubmit}
              size="lg"
              disabled={submitting}
            />
          ) : null}
        </>
      )}
    </ScrollView>
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
    content: { padding: Spacing.lg, paddingBottom: 40 },
    errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    patientHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xl },
    patientAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.lg,
    },
    patientInfo: { flex: 1 },
    patientName: Type.title,
    patientMeta: { fontSize: 13, color: Palette.textSecondary, marginTop: 2 },
    blockCard: { marginBottom: Spacing.lg },
    viewOnlyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    viewOnlyTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    viewOnlyBody: { fontSize: 13, color: Palette.textSecondary, lineHeight: 20 },
    scenarioCard: { marginBottom: Spacing.lg },
    scenarioHeader: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    scenarioTitle: { ...Type.itemTitle, fontSize: 17 },
    scenarioMeta: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    scenarioDescription: { fontSize: 14, color: Palette.text, lineHeight: 22, marginTop: Spacing.md },
    objectives: { marginTop: Spacing.md, gap: Spacing.sm },
    objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    objectiveText: { flex: 1, fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
    progressWrap: { marginTop: Spacing.md },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: Palette.borderLight, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: Palette.primary },
    progressLabel: { fontSize: 12, color: Palette.textSecondary, fontWeight: '600', marginTop: 6 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.md },
    resultStat: { alignItems: 'center' },
    resultValue: { fontSize: 22, fontWeight: '800', color: Palette.primary },
    resultLabel: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    reviewCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.lg },
    reviewText: { flex: 1 },
    reviewTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink, marginBottom: 2 },
    reviewBody: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
    sectionTitle: { ...Type.sectionTitle, marginBottom: Spacing.md },
    sectionSpacer: { marginTop: Spacing.sm },
    vitalsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    vitalCell: { alignItems: 'center', flex: 1 },
    vitalLabel: { fontSize: 11, color: Palette.textMuted, fontWeight: '600' },
    vitalValue: { fontSize: 18, fontWeight: '800', color: Palette.ink, marginTop: 2 },
    vitalUnit: { fontSize: 10, color: Palette.textFaint, marginTop: 1 },
    vitalsTime: { fontSize: 11, color: Palette.textMuted, marginTop: Spacing.md },
    anomalyAlert: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      backgroundColor: Accent.red.bg,
      borderRadius: Radius.sm,
      padding: Spacing.md,
      marginTop: Spacing.md,
    },
    anomalyBody: { flex: 1 },
    anomalyText: { fontSize: 12, color: Accent.red.fg, fontWeight: '600' },
    anomalyAdvice: { fontSize: 12, color: Accent.red.fg, marginTop: 4, lineHeight: 18 },
    recordHint: { fontSize: 12, color: Palette.textSecondary, marginBottom: Spacing.md, marginTop: -Spacing.sm },
    recordRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    recordButton: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    recordIcon: {
      width: 38,
      height: 38,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    recordLabel: { fontSize: 12, fontWeight: '700', color: Palette.ink },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
    checkText: { flex: 1 },
    checkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    checkTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink, flexShrink: 1 },
    checkTitleDone: { textDecorationLine: 'line-through', color: Palette.textMuted },
    checkDescription: { fontSize: 12, color: Palette.textSecondary, marginTop: 2, lineHeight: 18 },
    checkHint: { fontSize: 11, color: Palette.textMuted, marginTop: 4 },
    checkPoints: { fontSize: 12, fontWeight: '700', color: Palette.textSecondary },
    historyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.md },
    historyBorder: { borderBottomWidth: 1, borderBottomColor: Palette.borderLight },
    historyIcon: {
      width: 32,
      height: 32,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyBody: { flex: 1 },
    historyTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    historyTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink },
    historyValues: { fontSize: 13, color: Palette.textSecondary, marginTop: 2 },
    historyTime: { fontSize: 11, color: Palette.textMuted, marginTop: 2 },
    composer: { marginBottom: Spacing.lg },
    noteInput: {
      minHeight: 80,
      fontSize: 14,
      color: Palette.text,
      textAlignVertical: 'top',
      marginBottom: Spacing.md,
    },
    noteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: Palette.primary,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
    },
    noteButtonDisabled: { opacity: 0.5 },
    noteButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    recordCard: { marginBottom: Spacing.md },
    recordCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    recordType: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
    recordTypeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
    recordDate: { fontSize: 11, color: Palette.textMuted },
    recordContent: { fontSize: 14, color: Palette.text, lineHeight: 21 },
    assistButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: Accent.amber.bg,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.lg,
    },
    assistText: { fontSize: 13, fontWeight: '700', color: Accent.amber.fg },
    emptyText: { fontSize: 13, color: Palette.textMuted },
  });
}
