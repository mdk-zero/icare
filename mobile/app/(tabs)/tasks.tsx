import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader, SectionHeader, EmptyState, SkeletonScreen, SkeletonBlock } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchScenarioAssignments, fetchAiTips, ScenarioAssignment, AiTip } from '@/lib/api';

function TipCard({ tip }: { tip: AiTip }) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  return (
    <View style={styles.tipCard}>
      <View style={[styles.tipIconBox, { backgroundColor: Accent.blue.bg }]}>
        <Ionicons name="bulb" size={14} color={Accent.blue.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        {tip.scenario_title ? (
          <Text style={styles.tipScenario} numberOfLines={1}>
            {tip.scenario_title}
          </Text>
        ) : null}
        <Text style={styles.tipText}>{tip.tip}</Text>
      </View>
    </View>
  );
}

function TaskCard({ task, onPress }: { task: ScenarioAssignment; onPress: () => void }) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const completed = task.status === 'completed';
  const statusAccent =
    task.status === 'completed'
      ? Accent.green
      : task.status === 'in_progress'
        ? Accent.amber
        : task.status === 'overdue'
          ? Accent.red
          : Accent.slate;
  const statusIcon =
    task.status === 'completed'
      ? 'checkmark'
      : task.status === 'in_progress'
        ? 'ellipse'
        : task.status === 'overdue'
          ? 'alert'
          : 'ellipse-outline';
  const requiredAccent = task.required ? Accent.red : Accent.slate;

  return (
    <Pressable
      style={({ pressed }) => [styles.taskCard, completed && styles.taskCardCompleted, pressed && styles.pressedCard]}
      onPress={onPress}
    >
      <View style={styles.taskHeader}>
        <View style={styles.taskHeaderLeft}>
          <View style={[styles.taskIconBox, { backgroundColor: statusAccent.bg }]}>
            <Ionicons name={statusIcon} size={14} color={statusAccent.fg} />
          </View>
          <View style={styles.taskHeaderText}>
            <Text style={[styles.taskTitle, completed && styles.taskTitleCompleted]} numberOfLines={1}>
              {task.scenario_title}
            </Text>
            <View style={styles.taskPatientRow}>
              <Ionicons name="calendar-outline" size={12} color={Palette.textSecondary} />
              <Text style={styles.taskPatient}>
                Assigned {new Date(task.assigned_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
      </View>

      {completed ? (
        <View style={styles.taskFooter}>
          <View style={[styles.priorityPill, { backgroundColor: Accent.green.bg }]}>
            <Text style={[styles.priorityText, { color: Accent.green.fg }]}>
              Score: {task.score ?? '—'}%
            </Text>
          </View>
          {task.completed_at && (
            <View style={styles.dueRow}>
              <Ionicons name="checkmark-done-outline" size={12} color={Palette.textMuted} />
              <Text style={styles.taskDue}>
                {new Date(task.completed_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.taskFooter}>
          <View style={[styles.priorityPill, { backgroundColor: requiredAccent.bg }]}>
            <View style={[styles.priorityDot, { backgroundColor: requiredAccent.fg }]} />
            <Text style={[styles.priorityText, { color: requiredAccent.fg }]}>
              {task.required ? 'Required' : 'Optional'}
            </Text>
          </View>
          <View style={styles.dueRow}>
            <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
            <Text style={styles.taskDue}>
              {task.deadline
                ? `Due ${new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                : 'No deadline'}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function TasksScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchScenarioAssignments);
  // Loaded separately so a slow generation never holds up the task list.
  const tips = useApiData(fetchAiTips);

  // Re-pull when returning from the scenario runner so completions show up.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  const refreshTips = tips.refresh;
  const handleRefresh = React.useCallback(() => {
    refresh();
    refreshTips();
  }, [refresh, refreshTips]);

  if (loading && !data) {
    return <SkeletonScreen topOffset={insets.top + 88} />;
  }

  const assignments = data ?? [];
  const pendingTasks = assignments.filter((t) => t.status === 'pending' || t.status === 'overdue');
  const inProgressTasks = assignments.filter((t) => t.status === 'in_progress');
  const completedTasks = assignments.filter((t) => t.status === 'completed');
  const remaining = pendingTasks.length + inProgressTasks.length;

  const tipList = tips.data?.tips ?? [];
  // Nothing assigned means the server returns no tips; hide the section rather
  // than showing an empty box under an already-empty task list.
  const showTips = tips.loading || tipList.length > 0 || Boolean(tips.error);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      <ScreenHeader
        eyebrow="Clinical Duty"
        title="Assigned Scenarios"
        subtitle={`${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}
        icon="clipboard-outline"
      />

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}

      <Pressable
        style={({ pressed }) => [styles.quickLink, pressed && styles.pressedCard]}
        onPress={() => router.push('/tasks/quizzes')}
      >
        <View style={[styles.quickLinkIcon, { backgroundColor: Accent.violet.bg }]}>
          <Ionicons name="document-text" size={19} color={Accent.violet.fg} />
        </View>
        <View style={styles.quickLinkText}>
          <Text style={styles.quickLinkTitle}>Quizzes</Text>
          <Text style={styles.quickLinkSubtitle}>Assessments and knowledge checks</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
      </Pressable>

      {showTips ? (
        <View style={styles.section}>
          <SectionHeader title="AI Study Tips" subtitle="Generated from your assigned scenarios" />
          {tips.loading && tipList.length === 0 ? (
            <View style={styles.tipCard}>
              <View style={styles.tipBody}>
                <SkeletonBlock width="55%" height={13} />
                <SkeletonBlock width="100%" height={11} style={styles.tipSkeletonLine} />
                <SkeletonBlock width="80%" height={11} style={styles.tipSkeletonLine} />
              </View>
            </View>
          ) : tipList.length > 0 ? (
            tipList.map((tip, index) => <TipCard key={`${tip.title}-${index}`} tip={tip} />)
          ) : (
            <EmptyState icon="cloud-offline-outline" message={tips.error ?? 'No tips available right now.'} />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="In Progress" count={inProgressTasks.length} />
        {inProgressTasks.length > 0 ? (
          inProgressTasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => router.push(`/tasks/${task.id}`)} />
          ))
        ) : (
          <EmptyState icon="checkmark-circle-outline" message="No tasks in progress" />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Pending" count={pendingTasks.length} />
        {pendingTasks.length > 0 ? (
          pendingTasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => router.push(`/tasks/${task.id}`)} />
          ))
        ) : (
          <EmptyState icon="checkmark-done-circle-outline" message="All tasks completed!" tone="success" />
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Completed" count={completedTasks.length} />
        {completedTasks.length > 0 ? (
          completedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => router.push(`/tasks/${task.id}`)} />
          ))
        ) : (
          <EmptyState message="No completed tasks yet" />
        )}
      </View>
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
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    // clears the floating tab bar so the last items can scroll above it
    paddingBottom: 128,
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  quickLinkIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  quickLinkText: {
    flex: 1,
  },
  quickLinkTitle: Type.itemTitle,
  quickLinkSubtitle: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  tipIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  tipBody: {
    flex: 1,
  },
  tipTitle: Type.itemTitle,
  tipScenario: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.textMuted,
    marginTop: 2,
  },
  tipText: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
    marginTop: 6,
  },
  tipSkeletonLine: {
    marginTop: 8,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  taskCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  taskCardCompleted: {
    opacity: 0.65,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  taskHeaderText: {
    flex: 1,
  },
  taskIconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  taskTitle: Type.itemTitle,
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Palette.textMuted,
  },
  taskPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  taskPatient: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  taskDescription: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskDue: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  });
}
