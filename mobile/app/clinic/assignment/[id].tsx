import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, SkeletonBlock, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData, allCached } from '@/hooks/useApiData';
import { useCaseClock } from '@/hooks/useCaseClock';
import {
  fetchScenarioAssignments,
  fetchScenario,
  fetchScenarioTasks,
  roomLabel,
  Scenario,
  type CasePatient,
} from '@/lib/api';
import { CountdownCard } from '@/components/CountdownCard';
import { performOn } from '@/lib/return-demos';
import { ClinicalTaskList, ClinicalTaskListSkeleton } from '@/components/ClinicalTaskList';
import { AssistanceButton } from '@/components/AssistanceButton';
import { CaseOpening, CaseStartGate } from '@/components/CaseStartGate';

/** How often an open scenario re-checks for the instructor's grades. */
const GRADE_POLL_MS = 8000;

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const VITALS: { key: keyof CasePatient['vitals']; label: string; unit: string }[] = [
  { key: 'blood_pressure', label: 'BP', unit: 'mmHg' },
  { key: 'heart_rate', label: 'HR', unit: 'bpm' },
  { key: 'temperature', label: 'Temp', unit: '°C' },
  { key: 'respiratory_rate', label: 'RR', unit: '/min' },
  { key: 'oxygen_saturation', label: 'SpO₂', unit: '%' },
];

/** The patient the instructor wrote into the case (098): who they are and the state they are in. */
function PatientCard({ patientCase, styles }: { patientCase: CasePatient; styles: ReturnType<typeof createStyles> }) {
  const p = patientCase.patient;
  const who = [p?.age != null ? `${p.age} yrs` : null, p?.sex || null].filter(Boolean).join(' · ');
  const vitals = VITALS.filter((v) => {
    const value = patientCase.vitals?.[v.key];
    return value !== null && value !== undefined && value !== '';
  });
  const rows = [
    { label: 'Diagnosis', value: patientCase.diagnosis },
    { label: 'Medical history', value: patientCase.medical_history },
    { label: 'Physical findings', value: patientCase.physical_exam },
  ].filter((r) => r.value?.trim());
  return (
    <Card style={styles.blockCard}>
      <Text style={styles.blockLabel}>Your Patient</Text>
      {p?.name ? (
        <View style={styles.patientHead}>
          <View style={styles.patientAvatar}>
            <Text style={styles.patientInitials}>
              {p.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.patientName}>{p.name}</Text>
            {who ? <Text style={styles.patientWho}>{who}</Text> : null}
          </View>
        </View>
      ) : null}
      {patientCase.chief_complaint?.trim() ? <Text style={styles.condition}>{patientCase.chief_complaint}</Text> : null}
      {vitals.length > 0 && (
        <View style={styles.vitals}>
          {vitals.map((v) => (
            <View key={v.key} style={styles.vital}>
              <Text style={styles.vitalLabel}>{v.label}</Text>
              <Text style={styles.vitalValue}>{String(patientCase.vitals[v.key])}</Text>
              <Text style={styles.vitalUnit}>{v.unit}</Text>
            </View>
          ))}
        </View>
      )}
      {rows.map((r) => (
        <View key={r.label} style={styles.caseRow}>
          <Text style={styles.caseKey}>{r.label}</Text>
          <Text style={styles.caseValue}>{r.value}</Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * A patient case as the student works it (098): the patient the instructor
 * wrote into the case, the room it is performed in, the tasks and the clock,
 * counting down when the case has a time limit. Grades appear as the
 * instructor saves them.
 */
export default function ScenarioBriefScreen() {
  const params = useLocalSearchParams<{ id: string; gate?: string; title?: string; due?: string; tasks?: string }>();
  const router = useRouter();
  const assignmentId = params.id;
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

  // A graded case shows only its result and grades, so it doesn't need the
  // brief: skipping it keeps the screen from loading in a second time.
  const graded = (taskAssignment?.status ?? assignment?.status) === 'completed';
  useEffect(() => {
    if (!assignment || graded) return;
    let cancelled = false;
    fetchScenario(assignment.scenario_id)
      .then((result) => {
        if (!cancelled) setScenario(result.data);
      })
      .catch((err) => {
        if (!cancelled) setScenarioError(err instanceof Error ? err.message : 'Unable to load patient case');
      });
    return () => {
      cancelled = true;
    };
  }, [assignment?.scenario_id, graded]); // eslint-disable-line react-hooks/exhaustive-deps


  const status = taskAssignment?.status ?? assignment?.status ?? 'pending';
  const submittedAt = taskAssignment?.submitted_at ?? null;
  const isCompleted = status === 'completed';
  const isSubmitted = !isCompleted && Boolean(submittedAt);
  const isActive = !isCompleted && !isSubmitted;
  // Opens on the case's instructions until Start, then times the demonstration.
  const clock = useCaseClock(taskAssignment, isActive, assignmentId);
  const elapsed = clock.elapsed;
  const timeLimit = taskAssignment?.time_limit_minutes ?? assignment?.time_limit_minutes ?? null;
  const room = taskAssignment?.room ?? assignment?.room ?? null;
  const patientCase = taskResult?.patient_case ?? null;

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


  // Known not started (lib/open-case): its Before you start screen shows at once.
  if (params.gate === '1' && !clock.started && !taskAssignment) {
    return (
      <CaseStartGate
        title={assignment?.scenario_title ?? params.title ?? 'Patient case'}
        patientName={assignment?.patient_name}
        room={room ? roomLabel(room) : null}
        timeLimitMinutes={timeLimit}
        deadline={assignment?.deadline ?? (params.due || null)}
        taskCount={params.tasks ? Number(params.tasks) : null}
        starting={clock.starting}
        onStart={clock.start}
      />
    );
  }

  if (params.gate === 'wait' && !taskAssignment && !error) return <CaseOpening />;

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading the patient case">
        <View style={styles.header}>
          <SkeletonBlock width={76} height={22} radius={999} />
          <SkeletonBlock width={70} height={22} radius={999} />
        </View>
        <SkeletonBlock width="85%" height={24} />
        <SkeletonBlock width="55%" height={24} style={{ marginTop: 6 }} />
        <SkeletonBlock width="50%" height={13} style={{ marginTop: 10, marginBottom: Spacing.lg }} />
        <Card style={styles.reviewCard}>
          <SkeletonBlock width={20} height={20} radius={10} />
          <View style={styles.reviewText}>
            <SkeletonBlock width="60%" height={15} />
            <SkeletonBlock width="100%" height={12} style={{ marginTop: 8 }} />
            <SkeletonBlock width="75%" height={12} style={{ marginTop: 6 }} />
          </View>
        </Card>
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Patient Case</Text>
          <SkeletonBlock width="100%" height={13} />
          <SkeletonBlock width="95%" height={13} style={{ marginTop: 7 }} />
          <SkeletonBlock width="60%" height={13} style={{ marginTop: 7 }} />
        </Card>
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Clinical Tasks</Text>
          <ClinicalTaskListSkeleton rows={3} />
        </Card>
      </View>
    );
  }

  if (!assignment) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Assignment not found'} />
      </View>
    );
  }

  // Until the tasks load we can't tell whether it has started (see the patient screen).
  if (isActive && !taskAssignment && !error) return <CaseOpening />;

  if (clock.needsStart) {
    return (
      <CaseStartGate
        title={assignment.scenario_title}
        patientName={patientCase?.patient?.name ?? assignment.patient_name}
        room={room ? roomLabel(room) : null}
        timeLimitMinutes={timeLimit}
        deadline={assignment.deadline}
        taskCount={totalCount}
        starting={clock.starting}
        onStart={clock.start}
      />
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
      <Text style={styles.title}>{assignment.scenario_title}</Text>
      <Text style={styles.subtitle}>
        {performOn(assignment.deadline)}
        {room ? ` · ${roomLabel(room)}` : ''}
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
              <Text style={styles.resultValue}>{taskAssignment?.time_taken != null ? formatTime(taskAssignment.time_taken) : '—'}</Text>
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

      {isCompleted ? null : isSubmitted ? (
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

      <CountdownCard elapsed={elapsed} timeLimitMinutes={timeLimit} />

      {/* Graded: just the result and the grades; the brief, the patient and the chart are for doing it. */}
      {!isCompleted && scenarioError && <EmptyState icon="cloud-offline-outline" message={scenarioError} />}

      {!isCompleted && scenario && scenario.description.length > 0 && (
        <Card style={styles.blockCard}>
          <Text style={styles.blockLabel}>Patient Case</Text>
          <Text style={styles.description}>{scenario.description}</Text>
        </Card>
      )}

      {!isCompleted && patientCase && <PatientCard patientCase={patientCase} styles={styles} />}

      {/* The help flag belongs where the student is working, not buried in
          settings — this is the ERD's assistance request. */}
      {isActive && (
        <AssistanceButton scenarioTitle={assignment.scenario_title} patientId={scenario?.patient_id ?? null} />
      )}

      {!isCompleted && scenario && scenario.learning_objectives.length > 0 && (
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
          <Text style={styles.emptyTasks}>No tasks have been set for this patient case yet.</Text>
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
  patientHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  patientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
  },
  patientInitials: { color: '#fff', fontWeight: '700', fontSize: 15 },
  patientName: { fontSize: 17, fontWeight: '700', color: Palette.ink },
  patientWho: { fontSize: 13, color: Palette.textSecondary, marginTop: 1 },
  condition: { fontSize: 14, color: Palette.text, lineHeight: 21, marginBottom: Spacing.md },
  vitals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  vital: {
    minWidth: 70,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.borderLight,
    backgroundColor: Palette.surfaceMuted,
  },
  vitalLabel: { fontSize: 10, fontWeight: '700', color: Palette.textSecondary, letterSpacing: 0.5 },
  vitalValue: { fontSize: 16, fontWeight: '700', color: Palette.ink, fontVariant: ['tabular-nums'] },
  vitalUnit: { fontSize: 10, color: Palette.textMuted },
  objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  objectiveIcon: { marginTop: 2, marginRight: Spacing.sm },
  objectiveText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
  emptyTasks: { fontSize: 13, color: Palette.textMuted, paddingVertical: Spacing.sm },
  });
}
