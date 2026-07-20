import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { SectionHeader, LoadingSpinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useApiData, allCached } from '@/hooks/useApiData';
import {
  fetchScenarioAssignments,
  fetchAssessments,
  fetchProgress,
  fetchPatients,
  ScenarioAssignment,
} from '@/lib/api';

const today = new Date();
const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name?: string) {
  if (!name) return 'S';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const STATUS_COLORS: Record<string, string> = {
  completed: Accent.green.fg,
  in_progress: Accent.amber.fg,
  overdue: Accent.red.fg,
};

function formatDeadline(assignment: ScenarioAssignment): string {
  if (!assignment.deadline) return 'No deadline';
  return new Date(assignment.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function DashboardScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data, loading, refreshing, refresh } = useApiData(() =>
    allCached(fetchScenarioAssignments(), fetchAssessments(), fetchProgress(), fetchPatients()),
  );
  const [assignments, assessments, progress, patients] = data ?? [[], [], null, []];

  if (loading && !data) {
    return <LoadingSpinner />;
  }

  const openTasks = assignments.filter((a) => a.status !== 'completed');
  const scoredAttempts = (progress?.attempts ?? []).filter((a) => a.score !== null);
  const avgScore =
    scoredAttempts.length > 0
      ? Math.round(scoredAttempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / scoredAttempts.length)
      : null;
  const quizzesAvailable = assessments.filter((a) => a.attempt_count === 0).length;

  const stats = [
    { label: 'Pending Tasks', value: String(openTasks.length), icon: 'clipboard-outline' as const, accent: Accent.teal, href: '/tasks' },
    { label: 'Avg Score', value: avgScore === null ? '—' : `${avgScore}%`, icon: 'trending-up' as const, accent: Accent.green, href: '/progress' },
    { label: 'Quizzes Available', value: String(quizzesAvailable), icon: 'document-text-outline' as const, accent: Accent.violet, href: '/tasks/quizzes' },
    { label: 'My Patients', value: String(patients.length), icon: 'people-outline' as const, accent: Accent.cyan, href: '/ehr' },
  ];

  const quickActions = [
    { label: 'Vitals', icon: 'pulse' as const, accent: Accent.red, href: '/vitals' },
    { label: 'Tasks', icon: 'list' as const, accent: Accent.amber, href: '/tasks' },
    { label: 'Quizzes', icon: 'document-text' as const, accent: Accent.violet, href: '/tasks/quizzes' },
    { label: 'AI Tips', icon: 'bulb-outline' as const, accent: Accent.blue, href: '/recommendations' },
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
      <View style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{user?.name || 'Student'}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.avatar, pressed && styles.pressedDim]}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <Pressable
            key={stat.label}
            style={({ pressed }) => [styles.statCard, pressed && styles.pressedCard]}
            onPress={() => router.push(stat.href as any)}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIconTile, { backgroundColor: stat.accent.bg }]}>
                <Ionicons name={stat.icon} size={20} color={stat.accent.fg} />
              </View>
              <Ionicons name="chevron-forward" size={15} color={Palette.textFaint} />
            </View>
            <Text style={[styles.statValue, { color: stat.accent.fg }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressedDim]}
              onPress={() => router.push(action.href as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.accent.bg }]}>
                <Ionicons name={action.icon} size={22} color={action.accent.fg} />
              </View>
              <Text style={styles.quickActionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Assigned Scenarios"
          subtitle={`${openTasks.length} pending`}
          actionLabel="See all"
          onAction={() => router.push('/tasks')}
        />
        <View style={styles.taskList}>
          {openTasks.length === 0 ? (
            <Text style={styles.emptyTasks}>No scenarios assigned yet — your faculty will assign them here.</Text>
          ) : (
            openTasks.slice(0, 3).map((task, index) => (
              <Pressable
                key={task.id}
                style={({ pressed }) => [
                  styles.taskItem,
                  index > 0 && styles.taskItemBorder,
                  pressed && styles.pressedDim,
                ]}
                onPress={() => router.push(`/tasks/${task.id}`)}
              >
                <View
                  style={[
                    styles.taskStatusDot,
                    { backgroundColor: STATUS_COLORS[task.status] ?? Palette.textMuted },
                  ]}
                />
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{task.scenario_title}</Text>
                  <View style={styles.taskMeta}>
                    <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
                    <Text style={styles.taskDue}>Due {formatDeadline(task)}</Text>
                    {task.required && (
                      <Text style={styles.taskRequired}>Required</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Palette.textFaint} />
              </Pressable>
            ))
          )}
        </View>
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
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  greetingText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  greeting: {
    fontSize: 14,
    color: Palette.textSecondary,
    fontWeight: '500',
  },
  name: {
    ...Type.screenTitle,
    fontSize: 26,
    marginTop: 2,
  },
  dateText: {
    fontSize: 13,
    color: Palette.textMuted,
    marginTop: Spacing.xs,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  pressedDim: {
    opacity: 0.7,
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  statCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statIconTile: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    color: Palette.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.text,
  },
  taskList: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  taskItemBorder: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  taskStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.md,
  },
  taskContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  taskTitle: {
    ...Type.itemTitle,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  taskPatient: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginLeft: 4,
  },
  taskMetaIcon: {
    marginLeft: Spacing.md,
  },
  taskDue: {
    fontSize: 12,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  taskRequired: {
    fontSize: 11,
    fontWeight: '700',
    color: Accent.red.fg,
    marginLeft: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyTasks: {
    fontSize: 13,
    color: Palette.textMuted,
    paddingVertical: Spacing.xl,
    textAlign: 'center',
  },
});
