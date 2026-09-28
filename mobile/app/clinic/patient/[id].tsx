import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
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
  fetchScenarioTasks,
  submitScenarioAssignment,
  ScenarioTask,
  ScenarioTasksResult,
  WardVitals,
} from '@/lib/api';
import { isNetworkError } from '@/lib/client';

/**
 * The patient hub — the end of the ward walk-through. It carries the scenario
 * brief, the latest vitals, the task checklist and the hand-in. Students no
 * longer chart here: RetDem is a skills demonstration, rated by the instructor
 * task by task, and what students write up is a real hospital case (Clinic →
 * Hospital Cases), not this simulated patient.
 *
 * A patient outside the student's scenarios stops at a read-only summary.
 */


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

  const [taskResult, setTaskResult] = React.useState<ScenarioTasksResult | null>(null);
  const [chartError, setChartError] = React.useState<string | null>(null);

  // Depends on the assignment *id*, not the object, so re-pulling the ward
  // cannot retrigger this and loop.
  const loadChart = React.useCallback(async () => {
    if (!assignmentId) return;
    try {
      const tasks = await fetchScenarioTasks(assignmentId);
      setTaskResult(tasks.data);
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Unable to load this scenario’s tasks');
    }
  }, [assignmentId]);

  // Faculty check tasks off while the student is elsewhere; refresh on return.
  useFocusEffect(
    React.useCallback(() => {
      reload();
      loadChart();
    }, [reload, loadChart]),
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

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

  const handleSubmit = () => {
    if (!assignmentId) return;
    Alert.alert(
      'Submit for Review',
      'Submit your work for instructor review? Your instructor rates each task and finalizes your score.',
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
            This patient is not part of a scenario assigned to you. Your instructor assigns the
            patient you are responsible for.
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
                  <Text style={[styles.checkTitle, task.is_completed && styles.checkTitleDone]}>
                    {task.title}
                  </Text>
                  <Text style={styles.checkDescription}>{task.description}</Text>
                  {task.is_completed ? (
                    <Text style={[styles.checkHint, { color: Accent.green.fg }]}>
                      {/* Charting used to tick some tasks by itself; those stay as done. */}
                      {task.completed_via === 'system' ? 'Completed' : 'Verified by instructor'}
                    </Text>
                  ) : (
                    <Text style={styles.checkHint}>Your instructor verifies this</Text>
                  )}
                </View>
                <Text style={styles.checkPoints}>{task.points} pts</Text>
              </View>
            ))}
          </Card>

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
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
    checkText: { flex: 1 },
    checkTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink, flexShrink: 1 },
    checkTitleDone: { textDecorationLine: 'line-through', color: Palette.textMuted },
    checkDescription: { fontSize: 12, color: Palette.textSecondary, marginTop: 2, lineHeight: 18 },
    checkHint: { fontSize: 11, color: Palette.textMuted, marginTop: 4 },
    checkPoints: { fontSize: 12, fontWeight: '700', color: Palette.textSecondary },
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
