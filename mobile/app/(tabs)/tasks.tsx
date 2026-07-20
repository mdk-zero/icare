import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { ScreenHeader, SectionHeader, EmptyState, LoadingSpinner } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchScenarioAssignments, ScenarioAssignment } from '@/lib/api';

function TaskCard({ task, onPress }: { task: ScenarioAssignment; onPress: () => void }) {
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
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchScenarioAssignments);

  // Re-pull when returning from the scenario runner so completions show up.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  if (loading && !data) {
    return <LoadingSpinner />;
  }

  const assignments = data ?? [];
  const pendingTasks = assignments.filter((t) => t.status === 'pending' || t.status === 'overdue');
  const inProgressTasks = assignments.filter((t) => t.status === 'in_progress');
  const completedTasks = assignments.filter((t) => t.status === 'completed');
  const remaining = pendingTasks.length + inProgressTasks.length;

  const quickLinks = [
    { label: 'Quizzes', icon: 'document-text' as const, accent: Accent.violet, href: '/tasks/quizzes' },
    { label: 'AI Tips', icon: 'bulb' as const, accent: Accent.blue, href: '/recommendations' },
    { label: 'Alerts', icon: 'notifications' as const, accent: Accent.amber, href: '/notifications' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <ScreenHeader
        eyebrow="Clinical Duty"
        title="Assigned Scenarios"
        subtitle={`${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}
        icon="clipboard-outline"
      />

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}

      <View style={styles.quickLinks}>
        {quickLinks.map((link) => (
          <Pressable
            key={link.label}
            style={({ pressed }) => [styles.quickLink, pressed && styles.pressedCard]}
            onPress={() => router.push(link.href as any)}
          >
            <View style={[styles.quickLinkIcon, { backgroundColor: link.accent.bg }]}>
              <Ionicons name={link.icon} size={19} color={link.accent.fg} />
            </View>
            <Text style={styles.quickLinkText}>{link.label}</Text>
          </Pressable>
        ))}
      </View>

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

const styles = StyleSheet.create({
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
  quickLinks: {
    flexDirection: 'row',
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  quickLink: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
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
    marginBottom: 6,
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.text,
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
