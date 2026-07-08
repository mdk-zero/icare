import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { ScreenHeader, SectionHeader, EmptyState } from '@/components/ui';
import { mockTasks, mockQuizzes } from '@/lib/mocks';

type Task = (typeof mockTasks)[number];

const PRIORITY_ACCENT: Record<string, { fg: string; bg: string }> = {
  high: Accent.red,
  medium: Accent.amber,
  low: Accent.green,
};

function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const completed = task.status === 'completed';
  const statusAccent =
    task.status === 'completed' ? Accent.green : task.status === 'in_progress' ? Accent.amber : Accent.slate;
  const statusIcon =
    task.status === 'completed' ? 'checkmark' : task.status === 'in_progress' ? 'ellipse' : 'ellipse-outline';
  const priority = PRIORITY_ACCENT[task.priority] ?? Accent.slate;

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
              {task.title}
            </Text>
            <View style={styles.taskPatientRow}>
              <Ionicons name="person-outline" size={12} color={Palette.textSecondary} />
              <Text style={styles.taskPatient}>{task.patientName}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
      </View>

      {!completed && (
        <>
          <Text style={styles.taskDescription} numberOfLines={2}>
            {task.description}
          </Text>
          <View style={styles.taskFooter}>
            <View style={[styles.priorityPill, { backgroundColor: priority.bg }]}>
              <View style={[styles.priorityDot, { backgroundColor: priority.fg }]} />
              <Text style={[styles.priorityText, { color: priority.fg }]}>{task.priority}</Text>
            </View>
            <View style={styles.dueRow}>
              <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
              <Text style={styles.taskDue}>
                {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

export default function TasksScreen() {
  const router = useRouter();

  const pendingTasks = mockTasks.filter((t) => t.status === 'pending');
  const inProgressTasks = mockTasks.filter((t) => t.status === 'in_progress');
  const completedTasks = mockTasks.filter((t) => t.status === 'completed');
  const remaining = pendingTasks.length + inProgressTasks.length;

  const quickLinks = [
    { label: 'Quizzes', icon: 'document-text' as const, accent: Accent.violet, href: '/tasks/quizzes' },
    { label: 'AI Tips', icon: 'bulb' as const, accent: Accent.blue, href: '/recommendations' },
    { label: 'Alerts', icon: 'notifications' as const, accent: Accent.amber, href: '/notifications' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="Clinical Duty"
        title="Clinical Tasks"
        subtitle={`${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}
        icon="clipboard-outline"
      />

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
          completedTasks
            .slice(0, 2)
            .map((task) => (
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
    paddingBottom: 32,
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
