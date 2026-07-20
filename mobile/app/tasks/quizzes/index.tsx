import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SectionHeader, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchAssessments, StudentAssessment } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

function difficultyAccent(
  Accent: ReturnType<typeof useTheme>['Accent'],
): Record<string, { fg: string; bg: string }> {
  return {
    beginner: Accent.green,
    intermediate: Accent.amber,
    advanced: Accent.red,
  };
}

function formatTimeLimit(seconds: number | null): string {
  if (!seconds) return 'No time limit';
  return `${Math.round(seconds / 60)} min`;
}

function QuizCard({
  quiz,
  onPress,
  Palette,
  Accent,
  styles,
}: {
  quiz: StudentAssessment;
  onPress: () => void;
  Palette: ReturnType<typeof useTheme>['Palette'];
  Accent: ReturnType<typeof useTheme>['Accent'];
  styles: ReturnType<typeof createStyles>;
}) {
  const DIFFICULTY_ACCENT = difficultyAccent(Accent);
  const difficulty = DIFFICULTY_ACCENT[quiz.difficulty] ?? Accent.slate;
  const attempted = quiz.attempt_count > 0;
  const dueSoon = quiz.assignment?.deadline
    ? new Date(quiz.assignment.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null;

  return (
    <Pressable style={({ pressed }) => [styles.quizCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.quizHeader}>
        <View style={[styles.quizIcon, { backgroundColor: attempted ? Accent.green.bg : difficulty.bg }]}>
          <Ionicons
            name={attempted ? 'checkmark' : 'document-text'}
            size={19}
            color={attempted ? Accent.green.fg : difficulty.fg}
          />
        </View>
        <View style={styles.quizInfo}>
          <Text style={styles.quizTitle}>{quiz.title}</Text>
          <Text style={styles.quizDesc} numberOfLines={1}>
            {quiz.description || quiz.category}
          </Text>
        </View>
        {attempted && quiz.best_score !== null ? (
          <View style={styles.scoreBadge}>
            <Ionicons name="trophy" size={13} color={Accent.green.fg} />
            <Text style={styles.scoreText}>{quiz.best_score}%</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
        )}
      </View>
      <View style={styles.quizMeta}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{quiz.category}</Text>
        </View>
        <View style={[styles.difficultyBadge, { backgroundColor: difficulty.bg }]}>
          <View style={[styles.difficultyDot, { backgroundColor: difficulty.fg }]} />
          <Text style={[styles.difficultyText, { color: difficulty.fg }]}>{quiz.difficulty}</Text>
        </View>
        {quiz.assignment?.required && !attempted && (
          <View style={[styles.difficultyBadge, { backgroundColor: Accent.red.bg }]}>
            <Text style={[styles.difficultyText, { color: Accent.red.fg }]}>Required</Text>
          </View>
        )}
      </View>
      <View style={styles.quizFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="help-circle-outline" size={13} color={Palette.textMuted} />
          <Text style={styles.footerText}>{quiz.question_count} questions</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={13} color={Palette.textMuted} />
          <Text style={styles.footerText}>{formatTimeLimit(quiz.time_limit_seconds)}</Text>
        </View>
        {dueSoon && (
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={13} color={Palette.textMuted} />
            <Text style={styles.footerText}>Due {dueSoon}</Text>
          </View>
        )}
        {attempted && (
          <View style={styles.footerItem}>
            <Ionicons name="repeat-outline" size={13} color={Palette.textMuted} />
            <Text style={styles.footerText}>
              {quiz.attempt_count} {quiz.attempt_count === 1 ? 'attempt' : 'attempts'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function QuizzesScreen() {
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchAssessments);

  // Refresh scores/attempt counts when returning from a quiz.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const assessments = data ?? [];
  const assigned = assessments.filter(
    (q) => q.assignment && q.assignment.status !== 'completed' && q.attempt_count === 0,
  );
  const available = assessments.filter(
    (q) => q.attempt_count === 0 && !assigned.includes(q),
  );
  const completed = assessments.filter((q) => q.attempt_count > 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.intro}>
        <Ionicons name="school-outline" size={16} color={Accent.violet.fg} />
        <Text style={styles.introText}>Assessments from your faculty&apos;s question banks</Text>
      </View>

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}

      {assigned.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Assigned to You" count={assigned.length} />
          {assigned.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} onPress={() => router.push(`/tasks/quizzes/${quiz.id}`)} Palette={Palette} Accent={Accent} styles={styles} />
          ))}
        </View>
      )}

      {available.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Available Quizzes" count={available.length} />
          {available.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} onPress={() => router.push(`/tasks/quizzes/${quiz.id}`)} Palette={Palette} Accent={Accent} styles={styles} />
          ))}
        </View>
      ) : assigned.length === 0 && completed.length > 0 ? (
        <View style={styles.emptySection}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-circle" size={44} color={Accent.green.fg} />
          </View>
          <Text style={styles.emptyTitle}>All Quizzes Completed!</Text>
          <Text style={styles.emptyText}>Check back later for new quizzes.</Text>
        </View>
      ) : assigned.length === 0 && completed.length === 0 && !error ? (
        <EmptyState icon="document-text-outline" message="No quizzes published yet — check back once your faculty publishes one." />
      ) : null}

      {completed.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Completed" count={completed.length} />
          {completed.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} onPress={() => router.push(`/tasks/quizzes/${quiz.id}`)} Palette={Palette} Accent={Accent} styles={styles} />
          ))}
        </View>
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
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 32,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Accent.violet.bg,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  introText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Accent.violet.fg,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  quizCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  quizTitle: {
    ...Type.itemTitle,
    fontWeight: '700',
  },
  quizDesc: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  quizMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  categoryBadge: {
    backgroundColor: Palette.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  difficultyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  quizFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: Palette.textMuted,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Accent.green.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: Accent.green.fg,
  },
  emptySection: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Accent.green.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Type.title,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  });
}
