import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
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
  Scenario,
} from '@/lib/api';
import { ClinicalTaskList } from '@/components/ClinicalTaskList';
import { AssistanceButton } from '@/components/AssistanceButton';
import { ReflectionCard } from '@/components/ReflectionCard';
import { scoreDescriptor } from '@/lib/task-ratings';

/** How often an open scenario re-checks for the instructor's grades. */
const GRADE_POLL_MS = 8000;

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

/**
 * Brief-only view of a scenario assignment. A scenario with a patient linked is
 * worked on the patient hub (app/clinic/patient/[id].tsx), where the checklist
 * and the hand-in sit together. This screen is where an assignment lands when
 * faculty never set scenarios.patient_id — the student can still read the
 * brief, follow the tasks and see their grades as the instructor saves them.
 */
export default function ScenarioBriefScreen() {
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

  // Faculty grade tasks while the student is elsewhere; refresh on return.
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


  const status = taskAssignment?.status ?? assignment?.status ?? 'pending';
  const submittedAt = taskAssignment?.submitted_at ?? null;
  const isCompleted = status === 'completed';
  const isSubmitted = !isCompleted && Boolean(submittedAt);
  const isActive = !isCompleted && !isSubmitted;

  // Grades land the moment the instructor saves them: while the screen is open
  // and the scenario isn't final, keep checking.
  useFocusEffect(
    React.useCallback(() => {
      if (isCompleted) return;
      const timer = setInterval(() => {
        reload();
      }, GRADE_POLL_MS);
      return () => clearInterval(timer);
    }, [isCompleted, reload]),
  );

  const totalCount = tasks.length;


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
        {assignment.team_name ? <Badge label={assignment.team_name} variant="info" /> : null}
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
              <Text style={styles.resultLabel}>
                {taskAssignment?.score != null ? scoreDescriptor(taskAssignment.score) : 'Score'}
              </Text>
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
      ) : null}

      {isCompleted ? (
        <ReflectionCard source="scenario" sourceId={assignment.id} />
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
        <Card style={styles.reviewCard}>
          <Ionicons name="eye-outline" size={20} color={Palette.primary} />
          <View style={styles.reviewText}>
            <Text style={styles.reviewTitle}>Graded by your instructor</Text>
            <Text style={styles.reviewBody}>
              Your instructor grades each task as you demonstrate it. Grades appear below once saved.
            </Text>
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
          <View style={styles.patientLinkRow}>
            <Pressable
              style={({ pressed }) => [styles.patientLinkButton, pressed && styles.patientLinkPressed]}
              onPress={() => router.push(`/clinic/patient/${scenario.patient_id}`)}
            >
              <Ionicons name="folder-open-outline" size={16} color={Palette.primary} />
              <Text style={styles.patientLinkText}>Patient Chart</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {/* The help flag belongs where the student is working, not buried in
          settings — this is the ERD's assistance request. */}
      {isActive && (
        <AssistanceButton scenarioTitle={assignment.scenario_title} patientId={scenario?.patient_id ?? null} />
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
        <ClinicalTaskList tasks={tasks} />
      </Card>

      <PrimaryButton title="Back to Clinic" onPress={() => router.back()} size="lg" variant="outline" />
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
  objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  objectiveIcon: { marginTop: 2, marginRight: Spacing.sm },
  objectiveText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
  emptyTasks: { fontSize: 13, color: Palette.textMuted, paddingVertical: Spacing.sm },
  });
}
