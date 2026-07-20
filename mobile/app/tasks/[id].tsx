import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, PrimaryButton, SkeletonScreen, EmptyState } from '@/components/ui';
import { Accent, Palette, Radius, Spacing, Type } from '@/constants/theme';
import { useApiData, allCached } from '@/hooks/useApiData';
import {
  fetchScenarioAssignments,
  fetchScenario,
  completeScenarioAssignment,
  Scenario,
  ScenarioAssignment,
} from '@/lib/api';
import { isNetworkError } from '@/lib/client';

// Same clinical checklist the web scenario runner uses; the earned share of
// points becomes the submitted score.
const CHECKLIST = [
  { id: 't1', title: 'Assess Patient Vital Signs', description: 'Measure heart rate, blood pressure, temperature, and respiratory rate', points: 10 },
  { id: 't2', title: 'Review Medical History', description: "Check patient's allergies, current medications, and past conditions", points: 10 },
  { id: 't3', title: 'Perform Physical Examination', description: 'Conduct head-to-toe physical assessment', points: 15 },
  { id: 't4', title: 'Administer Medication', description: 'Give prescribed medication with proper technique', points: 15 },
  { id: 't5', title: 'Develop Care Plan', description: 'Create nursing care plan based on patient needs', points: 15 },
  { id: 't6', title: 'Document Assessment', description: 'Accurately document all findings in patient chart', points: 10 },
  { id: 't7', title: 'Communicate with Patient', description: 'Explain procedure and provide health education', points: 10 },
  { id: 't8', title: 'Notify Healthcare Team', description: 'Report significant findings to physician', points: 15 },
];

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

function PatientCase({ patientCase }: { patientCase: Record<string, unknown> }) {
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

  const { data, loading, error } = useApiData(() =>
    allCached(fetchScenarioAssignments()),
  );
  const assignment = (data?.[0] ?? []).find((a) => a.id === assignmentId) ?? null;

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

  const [checked, setChecked] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScenarioAssignment | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const done = result ?? (assignment?.status === 'completed' ? assignment : null);

  useEffect(() => {
    if (done) return;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [done !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPoints = useMemo(() => CHECKLIST.reduce((sum, t) => sum + t.points, 0), []);
  const earnedPoints = CHECKLIST.filter((t) => checked.includes(t.id)).reduce(
    (sum, t) => sum + t.points,
    0,
  );

  const toggle = (taskId: string) => {
    if (done) return;
    setChecked((prev) =>
      prev.includes(taskId) ? prev.filter((t) => t !== taskId) : [...prev, taskId],
    );
  };

  const handleComplete = () => {
    if (!assignment) return;
    const score = Math.round((earnedPoints / totalPoints) * 100);
    Alert.alert(
      'Complete Scenario',
      `Submit with ${checked.length}/${CHECKLIST.length} tasks done (score ${score}%)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              const updated = await completeScenarioAssignment(assignment.id, score, elapsed);
              setResult(updated);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Badge
          label={done ? 'Completed' : assignment.status === 'overdue' ? 'Overdue' : assignment.status === 'in_progress' ? 'In Progress' : 'Pending'}
          variant={done ? 'success' : assignment.status === 'overdue' ? 'danger' : assignment.status === 'in_progress' ? 'warning' : 'default'}
        />
        {scenario && <Badge label={scenario.difficulty} variant={DIFFICULTY_VARIANT[scenario.difficulty]} />}
        {assignment.required && !done && <Badge label="Required" variant="danger" />}
      </View>

      <Text style={styles.title}>{assignment.scenario_title}</Text>
      <Text style={styles.subtitle}>
        {assignment.deadline
          ? `Due ${new Date(assignment.deadline).toLocaleString()}`
          : 'No deadline'}
      </Text>

      {done ? (
        <Card style={styles.resultCard}>
          <Text style={styles.blockLabel}>Result</Text>
          <View style={styles.resultRow}>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>{done.score ?? '—'}%</Text>
              <Text style={styles.resultLabel}>Score</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>{formatTime(done.time_taken ?? 0)}</Text>
              <Text style={styles.resultLabel}>Time</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultValue}>
                {done.completed_at
                  ? new Date(done.completed_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '—'}
              </Text>
              <Text style={styles.resultLabel}>Completed</Text>
            </View>
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
              {checked.length}/{CHECKLIST.length} tasks · {earnedPoints}/{totalPoints} pts
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(checked.length / CHECKLIST.length) * 100}%` }]} />
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

      {scenario && <PatientCase patientCase={scenario.patient_case} />}

      {scenario?.patient_id && (
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Assigned Patient</Text>
          <Text style={styles.patientLinkHint}>
            This scenario is linked to a patient — chart your vitals and EHR records there.
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
        {CHECKLIST.map((task) => {
          const isChecked = done ? true : checked.includes(task.id);
          return (
            <Pressable
              key={task.id}
              style={({ pressed }) => [styles.checkRow, pressed && !done && styles.checkRowPressed]}
              onPress={() => toggle(task.id)}
              disabled={!!done}
            >
              <Ionicons
                name={isChecked ? 'checkbox' : 'square-outline'}
                size={22}
                color={isChecked ? Accent.green.fg : Palette.textMuted}
              />
              <View style={styles.checkText}>
                <Text style={[styles.checkTitle, isChecked && !done && styles.checkTitleDone]}>
                  {task.title}
                </Text>
                <Text style={styles.checkDescription}>{task.description}</Text>
              </View>
              <Text style={styles.checkPoints}>{task.points} pts</Text>
            </Pressable>
          );
        })}
      </Card>

      {!done && (
        <PrimaryButton
          title={submitting ? 'Submitting…' : 'Complete Scenario'}
          onPress={handleComplete}
          size="lg"
          disabled={submitting}
        />
      )}
      {done && result && (
        <PrimaryButton title="Back to Tasks" onPress={() => router.back()} size="lg" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  objectiveIcon: { marginTop: 2, marginRight: Spacing.sm },
  objectiveText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
    gap: Spacing.md,
  },
  checkRowPressed: { opacity: 0.7 },
  checkText: { flex: 1 },
  checkTitle: { ...Type.itemTitle },
  checkTitleDone: { color: Accent.green.fg },
  checkDescription: { fontSize: 12, color: Palette.textSecondary, marginTop: 2, lineHeight: 17 },
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
