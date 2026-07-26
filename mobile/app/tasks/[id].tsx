import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, PrimaryButton, SkeletonScreen, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData, allCached } from '@/hooks/useApiData';
import {
  fetchScenarioAssignments,
  fetchScenario,
  fetchScenarioTasks,
  submitScenarioAssignment,
  Scenario,
  ScenarioTask,
} from '@/lib/api';
import { isNetworkError } from '@/lib/client';

const DIFFICULTY_VARIANT: Record<Scenario['difficulty'], 'success' | 'warning' | 'danger'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'danger',
};

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function PatientCase({
  patientCase,
  styles,
}: {
  patientCase: Record<string, unknown>;
  styles: ReturnType<typeof createStyles>;
}) {
  const entries = Object.entries(patientCase).filter(
    ([, value]) => typeof value === 'string' || typeof value === 'number',
  );
  if (entries.length === 0) return null;
  return (
    <Card style={styles.blockCard}>
      <Text style={styles.blockLabel}>Patient Case</Text>
      {entries.map(([key, value]) => (
        <View key={key} style={styles.caseRow}>
          <Text style={styles.caseKey}>{key.replaceAll('_', ' ')}</Text>
          <Text style={styles.caseValue}>{String(value)}</Text>
        </View>
      ))}
    </Card>
  );
}

export default function ScenarioRunnerScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const assignmentId = id as string;
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent, Type), [Palette, Accent, Type]);

  const { data, loading, error, refreshing, refresh, reload } = useApiData(() =>
    allCached(fetchScenarioAssignments(), fetchScenarioTasks(assignmentId)),
  );
  const assignment = (data?.[0] ?? []).find((a) => a.id === assignmentId) ?? null;
  const taskResult = data?.[1] ?? null;
  const tasks = useMemo(() => taskResult?.tasks ?? [], [taskResult]);
  const taskAssignment = taskResult?.assignment ?? null;

  // Coming back from recording vitals / charting should reflect the tasks that
  // auto-completed while the student was away.
  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [reload]),
  );

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignment) return;
    let cancelled = false;
    fetchScenario(assignment.scenario_id)
      .then((result) => {
        if (!cancelled) setScenario(result.data);
      })
      .catch((err) => {
        if (!cancelled) setScenarioError(err instanceof Error ? err.message : 'Unable to load scenario');
      });
    return () => {
      cancelled = true;
    };
  }, [assignment?.scenario_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = taskAssignment?.status ?? assignment?.status ?? 'pending';
  const submittedAt = taskAssignment?.submitted_at ?? null;
  const isCompleted = status === 'completed';
  const isSubmitted = !isCompleted && Boolean(submittedAt);
  const isActive = !isCompleted && !isSubmitted;

  useEffect(() => {
    if (!isActive) return;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalCount = tasks.length;
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const earnedPoints = tasks.filter((t) => t.is_completed).reduce((sum, t) => sum + t.points, 0);
  const autoPending = tasks.filter((t) => t.verification === 'system' && !t.is_completed).length;

  const handleSubmit = () => {
    if (!assignment) return;
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
              await submitScenarioAssignment(assignment.id, elapsed);
              await reload();
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

  if (!assignment) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Assignment not found'} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.header}>
        <Badge
          label={isCompleted ? 'Completed' : isSubmitted ? 'Awaiting Review' : assignment.status === 'overdue' ? 'Overdue' : assignment.status === 'in_progress' ? 'In Progress' : 'Pending'}
          variant={isCompleted ? 'success' : isSubmitted ? 'info' : assignment.status === 'overdue' ? 'danger' : assignment.status === 'in_progress' ? 'warning' : 'default'}
        />
        {scenario && <Badge label={scenario.difficulty} variant={DIFFICULTY_VARIANT[scenario.difficulty]} />}
        {assignment.required && isActive && <Badge label="Required" variant="danger" />}
      </View>

      <Text style={styles.title}>{assignment.scenario_title}</Text>
      <Text style={styles.subtitle}>
        {assignment.deadline
          ? `Due ${new Date(assignment.deadline).toLocaleString()}`
          : 'No deadline'}
      </Text>

      {isCompleted ? (
        <Card style={styles.resultCard}>
          <Text style={styles.blockLabel}>Result</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>{taskAssignment?.score ?? '—'}%</Text>
              <Text style={styles.resultLabel}>Score</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>{formatTime(taskAssignment?.time_taken ?? 0)}</Text>
              <Text style={styles.resultLabel}>Time</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>
                {taskAssignment?.completed_at
                  ? new Date(taskAssignment.completed_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '—'}
              </Text>
              <Text style={styles.resultLabel}>Finalized</Text>
            </View>
          </View>
        </Card>
      ) : isSubmitted ? (
        <Card style={styles.reviewCard}>
          <Ionicons name="hourglass-outline" size={20} color={Accent.blue.fg} />
          <View style={styles.reviewText}>
            <Text style={styles.reviewTitle}>Submitted for review</Text>
            <Text style={styles.reviewBody}>
              Your instructor is verifying the hands-on tasks. Your score is finalized once they confirm.
            </Text>
          </View>
        </Card>
      ) : (
        <Card style={styles.timerCard}>
          <View style={styles.timerRow}>
            <View style={styles.timerLeft}>
              <Ionicons name="stopwatch-outline" size={18} color={Palette.primary} />
              <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
            </View>
            <Text style={styles.timerProgress}>
              {completedCount}/{totalCount} tasks · {earnedPoints}/{totalPoints} pts
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }]} />
          </View>
        </Card>
      )}

      {scenarioError && <EmptyState icon="cloud-offline-outline" message={scenarioError} />}

      {scenario && scenario.description.length > 0 && (
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Scenario</Text>
          <Text style={styles.description}>{scenario.description}</Text>
        </Card>
      )}

      {scenario && <PatientCase patientCase={scenario.patient_case} styles={styles} />}

      {scenario?.patient_id && (
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Assigned Patient</Text>
          <Text style={styles.patientLinkHint}>
            Recording vitals or charting here automatically checks off the matching tasks below.
          </Text>
          <View style={styles.patientLinkRow}>
            <Pressable
              style={({ pressed }) => [styles.patientLinkButton, pressed && styles.patientLinkPressed]}
              onPress={() => router.push(`/ehr/${scenario.patient_id}`)}
            >
              <Ionicons name="folder-open-outline" size={16} color={Palette.primary} />
              <Text style={styles.patientLinkText}>Patient Chart</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.patientLinkButton, pressed && styles.patientLinkPressed]}
              onPress={() => router.push(`/vitals/${scenario.patient_id}`)}
            >
              <Ionicons name="pulse-outline" size={16} color={Palette.primary} />
              <Text style={styles.patientLinkText}>Record Vitals</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {/* The help flag belongs where the student is working, not buried in
          settings — this is the ERD's assistance request. */}
      {isActive && (
        <Pressable
          style={({ pressed }) => [styles.assistButton, pressed && styles.patientLinkPressed]}
          onPress={() => router.push('/assistance')}
        >
          <Ionicons name="hand-left-outline" size={16} color={Accent.amber.fg} />
          <Text style={styles.assistText}>Request instructor assistance</Text>
        </Pressable>
      )}

      {scenario && scenario.learning_objectives.length > 0 && (
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Learning Objectives</Text>
          {scenario.learning_objectives.map((objective, idx) => (
            <View key={idx} style={styles.objectiveRow}>
              <Ionicons name="school-outline" size={14} color={Palette.primary} style={styles.objectiveIcon} />
              <Text style={styles.objectiveText}>{String(objective)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.blockCard}>
        <Text style={styles.blockLabel}>Clinical Tasks</Text>
        {totalCount === 0 && (
          <Text style={styles.emptyTasks}>No tasks have been set for this scenario yet.</Text>
        )}
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
                <Text style={styles.doneHint}>
                  {task.completed_via === 'system' ? 'Auto-completed' : 'Verified by faculty'}
                </Text>
              ) : task.verification === 'system' ? (
                <Text style={styles.autoHint}>
                  {task.system_trigger === 'vitals'
                    ? 'Completes when you record vitals for this patient'
                    : 'Completes when you chart in the patient record'}
                </Text>
              ) : (
                <Text style={styles.facultyHint}>Your instructor verifies this</Text>
              )}
            </View>
            <Text style={styles.checkPoints}>{task.points} pts</Text>
          </View>
        ))}
      </Card>

      {isActive && (
        <PrimaryButton
          title={submitting ? 'Submitting…' : 'Submit for Review'}
          onPress={handleSubmit}
          size="lg"
          disabled={submitting}
        />
      )}
      {!isActive && <PrimaryButton title="Back to Tasks" onPress={() => router.back()} size="lg" />}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
  header: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  title: { ...Type.screenTitle, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Palette.textSecondary, marginBottom: Spacing.lg },
  timerCard: { marginBottom: Spacing.lg },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  timerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timerText: { fontSize: 20, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] },
  timerProgress: { fontSize: 12, color: Palette.textSecondary, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.borderLight,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Palette.primary },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  reviewText: { flex: 1 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink, marginBottom: 2 },
  reviewBody: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
  resultCard: { marginBottom: Spacing.lg },
  resultRow: { flexDirection: 'row', justifyContent: 'space-around' },
  resultStat: { alignItems: 'center' },
  resultValue: { fontSize: 22, fontWeight: '800', color: Palette.primary },
  resultLabel: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
  blockCard: { marginBottom: Spacing.lg },
  blockLabel: { ...Type.eyebrow, marginBottom: Spacing.md },
  description: { fontSize: 14, color: Palette.text, lineHeight: 22 },
  caseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
    gap: Spacing.md,
  },
  caseKey: { fontSize: 13, color: Palette.textSecondary, textTransform: 'capitalize' },
  caseValue: { fontSize: 13, fontWeight: '600', color: Palette.ink, flexShrink: 1, textAlign: 'right' },
  patientLinkHint: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19, marginBottom: Spacing.md },
  patientLinkRow: { flexDirection: 'row', gap: Spacing.md },
  patientLinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.primaryTint,
  },
  patientLinkPressed: { opacity: 0.7 },
  patientLinkText: { fontSize: 13, fontWeight: '600', color: Palette.primary },
  assistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Accent.amber.bg,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  assistText: { fontSize: 13, fontWeight: '700', color: Accent.amber.fg },
  objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  objectiveIcon: { marginTop: 2, marginRight: Spacing.sm },
  objectiveText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
  emptyTasks: { fontSize: 13, color: Palette.textMuted, paddingVertical: Spacing.sm },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
    gap: Spacing.md,
  },
  checkText: { flex: 1 },
  checkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  checkTitle: { ...Type.itemTitle },
  checkTitleDone: { color: Accent.green.fg },
  checkDescription: { fontSize: 12, color: Palette.textSecondary, marginTop: 2, lineHeight: 17 },
  autoHint: { fontSize: 11, color: Accent.blue.fg, marginTop: 4 },
  facultyHint: { fontSize: 11, color: Palette.textMuted, marginTop: 4 },
  doneHint: { fontSize: 11, color: Accent.green.fg, marginTop: 4, fontWeight: '600' },
  checkPoints: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.textMuted,
    backgroundColor: Palette.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  });
}
