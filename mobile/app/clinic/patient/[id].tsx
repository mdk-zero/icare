import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, SkeletonBlock, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { useCaseClock } from '@/hooks/useCaseClock';
import {
  fetchWard,
  fetchScenarioTasks,
  ScenarioTasksResult,
  WardVitals,
} from '@/lib/api';
import { ClinicalTaskList, ClinicalTaskListSkeleton } from '@/components/ClinicalTaskList';
import { AssistanceButton } from '@/components/AssistanceButton';

/** How often an open scenario re-checks for the instructor's grades. */
const GRADE_POLL_MS = 8000;

/**
 * The patient hub — the end of the ward walk-through. It carries the scenario
 * brief, the latest vitals and the task list. Students no
 * longer chart here: RetDem is a skills demonstration, rated by the instructor
 * task by task (there is nothing to hand in: the instructor grades as they
 * watch), and what students write up is a real hospital case (Clinic →
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
      setChartError(err instanceof Error ? err.message : 'Unable to load this patient case’s tasks');
    }
  }, [assignmentId]);

  // Faculty grade tasks while the student is elsewhere; refresh on return.
  useFocusEffect(
    React.useCallback(() => {
      reload();
      loadChart();
    }, [reload, loadChart]),
  );

  const tasks = taskResult?.tasks ?? [];
  const status = taskResult?.assignment.status ?? assignment?.status ?? 'pending';
  const submittedAt = taskResult?.assignment.submitted_at ?? assignment?.submitted_at ?? null;
  const isFinalized = status === 'completed';
  const isSubmitted = !isFinalized && Boolean(submittedAt);
  const isActive = isAssigned && !isFinalized && !isSubmitted;
  // Asks whether the student is ready, then times the demonstration.
  const elapsed = useCaseClock(taskResult?.assignment ?? null, isActive);

  // Grades land the moment the instructor saves them: while the screen is open
  // and the scenario isn't final, keep checking.
  useFocusEffect(
    React.useCallback(() => {
      if (!isAssigned || isFinalized) return;
      const timer = setInterval(() => {
        loadChart();
      }, GRADE_POLL_MS);
      return () => clearInterval(timer);
    }, [isAssigned, isFinalized, loadChart]),
  );


  if (loading && !data) {
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading the patient">
        <View style={styles.patientHeader}>
          <SkeletonBlock width={56} height={56} radius={28} style={{ marginRight: Spacing.lg }} />
          <View style={styles.patientInfo}>
            <SkeletonBlock width="60%" height={20} />
            <SkeletonBlock width="45%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
        <Card style={styles.scenarioCard}>
          <View style={styles.scenarioHeader}>
            <SkeletonBlock width={84} height={22} radius={Radius.pill} />
          </View>
          <SkeletonBlock width="80%" height={17} style={{ marginTop: 4 }} />
          <SkeletonBlock width="50%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBlock width="100%" height={12} style={{ marginTop: Spacing.md }} />
          <SkeletonBlock width="70%" height={12} style={{ marginTop: 6 }} />
        </Card>
        <Text style={styles.sectionTitle}>Latest Vitals</Text>
        <Card style={styles.blockCard}>
          <View style={styles.vitalsGrid}>
            {['HR', 'BP', 'Temp', 'SpO₂'].map((label) => (
              <View key={label} style={styles.vitalCell}>
                <Text style={styles.vitalLabel}>{label}</Text>
                <SkeletonBlock width={40} height={18} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>
        </Card>
        <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Clinical Tasks</Text>
        <Card style={styles.blockCard}>
          <ClinicalTaskListSkeleton />
        </Card>
      </View>
    );
  }

  if (!patient) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Patient not found'} />
      </View>
    );
  }

  const vitals = patient.latest_vitals ?? null;


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
            This patient is not part of a patient case assigned to you. Your instructor assigns the
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
                  <Text style={styles.resultValue}>{taskResult?.assignment.time_taken != null ? formatDuration(taskResult.assignment.time_taken) : '—'}</Text>
                  <Text style={styles.resultLabel}>Time</Text>
                </View>
              </View>
            ) : (
              <>
                {elapsed !== null ? (
                  <View style={styles.resultRow}>
                    <View style={styles.resultStat}>
                      <Text style={[styles.resultValue, styles.clock]}>{formatDuration(elapsed)}</Text>
                      <Text style={styles.resultLabel}>Time running</Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.gradingNote}>
                  <Ionicons name="eye-outline" size={14} color={Palette.textSecondary} />
                  <Text style={styles.gradingNoteText}>
                    Your instructor grades each task as you demonstrate it. Grades appear here once saved.
                  </Text>
                </View>
              </>
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
            {!chartError && !taskResult ? <ClinicalTaskListSkeleton /> : null}
            {!chartError && taskResult && tasks.length === 0 ? (
              <Text style={styles.emptyText}>No tasks have been set for this patient case yet.</Text>
            ) : null}
            <ClinicalTaskList tasks={tasks} />
          </Card>

          {/* The help flag belongs where the student is working, not buried in
              settings — this is the ERD's assistance request. */}
          {isActive && assignment ? (
            <AssistanceButton
              scenarioTitle={assignment.scenario_title}
              patientId={patient.id}
              patientName={patient.name}
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
    gradingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.md },
    gradingNoteText: { flex: 1, fontSize: 12, color: Palette.textSecondary, lineHeight: 17 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.md },
    resultStat: { alignItems: 'center' },
    resultValue: { fontSize: 22, fontWeight: '800', color: Palette.primary },
    resultLabel: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    clock: { fontVariant: ['tabular-nums'] },
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
    emptyText: { fontSize: 13, color: Palette.textMuted },
  });
}
