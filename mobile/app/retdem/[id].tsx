import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, PrimaryButton, SkeletonBlock, EmptyState } from '@/components/ui';
import { ScoreRing } from '@/components/ScoreRing';
import { ReturnDemoForms } from '@/components/ReturnDemoForms';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchMySkillMastery, fetchScenarioAssignments, fetchScenarioTasks } from '@/lib/api';
import { TASK_RATING_BADGE, TASK_RATING_LABEL } from '@/lib/task-ratings';

/** How often an open Return Demonstration re-checks for the instructor's grades. */
const GRADE_POLL_MS = 8000;
/** Below this BKT mastery a skill is worth reviewing before the demonstration. */
const READY_AT = 0.7;

/** "Assessing Body Temperature (Skill 1-1)" → ["Assessing Body Temperature", "Skill 1-1"] */
function splitSkillTitle(title: string): [string, string | null] {
  const m = /^(.*?)\s*\((Skill [\d-]+)\)\s*$/.exec(title);
  return m ? [m[1], m[2]] : [title, null];
}

/**
 * A Return Demonstration: the Taylor's skills the student will demonstrate to
 * the instructor, each with its checklist steps to prepare from. There is no
 * patient, no start and no timer: the instructor grades it in person. Once
 * graded, each step shows its rating (N/A steps are left out of the score)
 * and each skill the instructor's note. Forms the instructor added, such as
 * the PhilPEN form, come first: filled in here and submitted. The skills'
 * checklists open in a window of their own, so the form stays the first thing
 * on the screen.
 */
export default function ReturnDemoScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const assignmentId = id as string;
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Type), [Palette, Type]);
  const insets = useSafeAreaInsets();
  const [skillsOpen, setSkillsOpen] = useState(false);

  const { data, loading, error, refreshing, refresh, reload } = useApiData(() =>
    allCached(fetchScenarioAssignments(), fetchScenarioTasks(assignmentId)),
  );
  const assignment = (data?.[0] ?? []).find((a) => a.id === assignmentId) ?? null;
  const taskResult = data?.[1] ?? null;
  const tasks = useMemo(() => taskResult?.tasks ?? [], [taskResult]);
  const completed = (taskResult?.assignment.status ?? assignment?.status) === 'completed';
  // Readiness: the student's own BKT estimates, read once; a failed read just hides the card.
  const mastery = useApiData(fetchMySkillMastery);
  const toReview = useMemo(() => {
    const bySkill = new Map((mastery.data ?? []).map((m) => [m.skill_id, m.mastery]));
    return tasks.flatMap((task) => {
      const [title, skillNo] = splitSkillTitle(task.title);
      const skillId = skillNo?.replace(/^Skill\s+/, '');
      const known = skillId ? bySkill.get(skillId) : undefined;
      return known !== undefined && known < READY_AT ? [{ skillId: skillId as string, title, mastery: known }] : [];
    });
  }, [mastery.data, tasks]);

  // Grades land as the instructor saves them: keep checking while it's open.
  useFocusEffect(
    React.useCallback(() => {
      reload();
      if (completed) return;
      const timer = setInterval(() => reload(), GRADE_POLL_MS);
      return () => clearInterval(timer);
    }, [completed, reload]),
  );

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading the Return Demonstration">
        <SkeletonBlock width="40%" height={20} />
        <SkeletonBlock width="85%" height={26} style={{ marginTop: Spacing.md }} />
        <Card style={styles.skillCard}>
          <SkeletonBlock width="60%" height={14} />
          <SkeletonBlock width="100%" height={11} style={{ marginTop: Spacing.sm }} />
          <SkeletonBlock width="90%" height={11} style={{ marginTop: Spacing.sm }} />
        </Card>
      </View>
    );
  }
  if (!assignment) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'This Return Demonstration could not be found.'} />
      </View>
    );
  }

  const score = taskResult?.assignment.score ?? assignment.score;
  // The day they perform it, not a deadline.
  const performOn = assignment.deadline
    ? new Date(assignment.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      <Text style={styles.title}>{assignment.scenario_title}</Text>
      <Text style={styles.subtitle}>
        {performOn ? `Perform on ${performOn} · ` : ''}
        {tasks.length} skill{tasks.length === 1 ? '' : 's'} to demonstrate
      </Text>

      {/* Its forms (094), such as the PhilPEN form: filled in first, before the skills. */}
      <ReturnDemoForms assignmentId={assignmentId} />

      <Text style={styles.sectionTitle}>Skills to demonstrate</Text>
      <Card style={styles.skillsCard}>
        {completed && score != null ? (
          <View style={styles.resultRow}>
            <ScoreRing score={score} size={56} label="Score" color={Palette.primary} />
            <Text style={styles.resultText}>
              Graded by your instructor. Open the checklist to see how you did on each step.
            </Text>
          </View>
        ) : (
          <View style={styles.resultRow}>
            <Ionicons name="hand-left-outline" size={18} color={Accent.teal.fg} />
            <Text style={styles.prepareText}>
              You&apos;ll demonstrate each skill to your instructor, step by step. Open the checklist to prepare.
            </Text>
          </View>
        )}
        {tasks.length === 0 ? (
          <Text style={styles.goal}>No skills have been set for this Return Demonstration yet.</Text>
        ) : (
          tasks.map((task, i) => {
            const [skillTitle, skillNo] = splitSkillTitle(task.title);
            const rating = task.rating ?? null;
            return (
              <View key={task.id} style={styles.summaryRow}>
                <Text style={styles.skillNumber}>{String(i + 1).padStart(2, '0')}</Text>
                <View style={styles.skillHeaderText}>
                  {skillNo ? <Text style={styles.skillNo}>{skillNo}</Text> : null}
                  <Text style={styles.summaryTitle}>{skillTitle}</Text>
                  <Text style={styles.summarySteps}>
                    {task.steps?.length ?? 0} step{task.steps?.length === 1 ? '' : 's'}
                  </Text>
                </View>
                {rating ? (
                  <Badge
                    label={task.percent != null ? `${task.percent}%` : TASK_RATING_LABEL[rating]}
                    variant={TASK_RATING_BADGE[rating]}
                    size="sm"
                  />
                ) : null}
              </View>
            );
          })
        )}
        {tasks.length > 0 ? (
          <PrimaryButton
            title={completed ? 'See your ratings' : 'Open the skills checklist'}
            onPress={() => setSkillsOpen(true)}
            style={{ marginTop: Spacing.md }}
          />
        ) : null}
      </Card>

      {!completed && toReview.length > 0 ? (
        <Card style={styles.readyCard}>
          <View style={styles.readyHeader}>
            <Ionicons name="alert-circle-outline" size={18} color={Accent.amber.fg} />
            <Text style={styles.readyTitle}>Before you demonstrate</Text>
          </View>
          {toReview.map((s) => (
            <Text key={s.skillId} style={styles.readyLine}>
              <Text style={styles.readySkill}>{`Skill ${s.skillId}`}</Text>
              {` ${s.title} is ${Math.round(s.mastery * 100)}% mastered. Review it first.`}
            </Text>
          ))}
          <PrimaryButton
            title="Study it in the Library"
            onPress={() => router.push('/library')}
            size="sm"
            variant="outline"
            style={{ marginTop: Spacing.sm }}
          />
        </Card>
      ) : null}

      <Modal
        visible={skillsOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSkillsOpen(false)}
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.windowHeader}>
            <Pressable
              onPress={() => setSkillsOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <Ionicons name="close" size={22} color={Palette.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.windowTitle} numberOfLines={1}>
                Skills checklist
              </Text>
              <Text style={styles.windowSubtitle} numberOfLines={1}>
                {assignment.scenario_title}
              </Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.lg },
            ]}
          >
            {tasks.length === 0 ? (
              <EmptyState icon="list-outline" message="No skills have been set for this Return Demonstration yet." />
            ) : (
              tasks.map((task, i) => {
                const [skillTitle, skillNo] = splitSkillTitle(task.title);
                const rating = task.rating ?? null;
                return (
                  <Card key={task.id} style={styles.skillCard}>
                    <View style={styles.skillHeader}>
                      <Text style={styles.skillNumber}>{String(i + 1).padStart(2, '0')}</Text>
                      <View style={styles.skillHeaderText}>
                        {skillNo ? <Text style={styles.skillNo}>{skillNo}</Text> : null}
                        <Text style={styles.skillTitle}>{skillTitle}</Text>
                      </View>
                      {rating ? (
                        <Badge
                          label={task.percent != null ? `${task.percent}%` : TASK_RATING_LABEL[rating]}
                          variant={TASK_RATING_BADGE[rating]}
                          size="sm"
                        />
                      ) : null}
                    </View>
                    {task.description ? <Text style={styles.goal}>{task.description}</Text> : null}
                    {(task.steps ?? []).map((step, j) => (
                      <View key={step.id} style={styles.stepRow}>
                        <Text style={styles.stepNumber}>{j + 1}.</Text>
                        <Text style={styles.stepText}>{step.title}</Text>
                        {step.rating ? (
                          <Badge
                            label={TASK_RATING_LABEL[step.rating]}
                            variant={TASK_RATING_BADGE[step.rating]}
                            size="sm"
                          />
                        ) : null}
                      </View>
                    ))}
                    {task.remarks ? (
                      <View style={styles.note}>
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color={Palette.textSecondary} />
                        <Text style={styles.noteText}>{task.remarks}</Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      <PrimaryButton title="Back" onPress={() => router.back()} size="lg" variant="outline" />
    </ScrollView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Type: ReturnType<typeof useTheme>['Type']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 32 },
    errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    header: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
    title: { ...Type.screenTitle, marginBottom: Spacing.xs },
    subtitle: { fontSize: 14, color: Palette.textSecondary, marginBottom: Spacing.lg },
    resultText: { flex: 1, fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
    prepareText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
    readyCard: { marginBottom: Spacing.lg },
    readyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    readyTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    readyLine: { fontSize: 13, color: Palette.text, lineHeight: 19, marginTop: 4 },
    readySkill: { fontWeight: '700' },
    skillCard: { marginBottom: Spacing.lg },
    sectionTitle: { ...Type.sectionTitle, marginBottom: Spacing.sm },
    skillsCard: { marginBottom: Spacing.lg, gap: Spacing.sm },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xs },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    summaryTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink },
    summarySteps: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    windowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      backgroundColor: Palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: Palette.border,
    },
    close: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Palette.surfaceMuted,
    },
    windowTitle: { fontSize: 17, fontWeight: '700', color: Palette.ink },
    windowSubtitle: { fontSize: 12, color: Palette.textSecondary, marginTop: 1 },
    skillHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
    skillNumber: {
      fontSize: 13,
      fontWeight: '700',
      color: Palette.textFaint,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    skillHeaderText: { flex: 1 },
    skillNo: { ...Type.eyebrow },
    skillTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    goal: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    stepNumber: {
      width: 22,
      fontSize: 12,
      color: Palette.textMuted,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    stepText: { flex: 1, fontSize: 13, color: Palette.text, lineHeight: 19 },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.sm },
    noteText: { flex: 1, fontSize: 12, fontStyle: 'italic', color: Palette.textSecondary, lineHeight: 17 },
  });
}
