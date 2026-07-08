import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui';
import { mockQuizzes } from '@/lib/mocks';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';

const DIFFICULTY_ACCENT: Record<string, { fg: string; bg: string }> = {
  beginner: Accent.green,
  intermediate: Accent.amber,
  advanced: Accent.red,
};

export default function QuizzesScreen() {
  const router = useRouter();

  const availableQuizzes = mockQuizzes.filter((q) => q.completedCount < q.questionsCount);
  const completedQuizzes = mockQuizzes.filter((q) => q.completedCount >= q.questionsCount);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.intro}>
        <Ionicons name="school-outline" size={16} color={Accent.violet.fg} />
        <Text style={styles.introText}>Personalized questions based on your knowledge gaps</Text>
      </View>

      {availableQuizzes.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Available Quizzes" count={availableQuizzes.length} />
          {availableQuizzes.map((quiz) => {
            const difficulty = DIFFICULTY_ACCENT[quiz.difficulty] ?? Accent.slate;
            return (
              <Pressable
                key={quiz.id}
                style={({ pressed }) => [styles.quizCard, pressed && styles.pressed]}
                onPress={() => router.push(`/tasks/quizzes/${quiz.id}`)}
              >
                <View style={styles.quizHeader}>
                  <View style={[styles.quizIcon, { backgroundColor: difficulty.bg }]}>
                    <Ionicons name="document-text" size={19} color={difficulty.fg} />
                  </View>
                  <View style={styles.quizInfo}>
                    <Text style={styles.quizTitle}>{quiz.title}</Text>
                    <Text style={styles.quizDesc} numberOfLines={1}>{quiz.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
                </View>
                <View style={styles.quizMeta}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{quiz.category}</Text>
                  </View>
                  <View style={[styles.difficultyBadge, { backgroundColor: difficulty.bg }]}>
                    <View style={[styles.difficultyDot, { backgroundColor: difficulty.fg }]} />
                    <Text style={[styles.difficultyText, { color: difficulty.fg }]}>{quiz.difficulty}</Text>
                  </View>
                </View>
                <View style={styles.quizProgress}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(quiz.completedCount / quiz.questionsCount) * 100}%`,
                          backgroundColor: difficulty.fg,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {quiz.completedCount}/{quiz.questionsCount}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptySection}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-circle" size={44} color={Accent.green.fg} />
          </View>
          <Text style={styles.emptyTitle}>All Quizzes Completed!</Text>
          <Text style={styles.emptyText}>Check back later for new quizzes.</Text>
        </View>
      )}

      {completedQuizzes.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Completed" count={completedQuizzes.length} />
          {completedQuizzes.map((quiz) => (
            <View key={quiz.id} style={[styles.quizCard, styles.quizCardCompleted]}>
              <View style={styles.quizHeader}>
                <View style={[styles.quizIcon, { backgroundColor: Accent.green.bg }]}>
                  <Ionicons name="checkmark" size={19} color={Accent.green.fg} />
                </View>
                <View style={styles.quizInfo}>
                  <Text style={[styles.quizTitle, styles.quizTitleCompleted]}>{quiz.title}</Text>
                  <Text style={styles.quizDesc} numberOfLines={1}>{quiz.description}</Text>
                </View>
                <View style={styles.scoreBadge}>
                  <Ionicons name="trophy" size={13} color={Accent.green.fg} />
                  <Text style={styles.scoreText}>{quiz.lastScore}%</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
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
  quizCardCompleted: {
    opacity: 0.7,
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
  quizTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Palette.textMuted,
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
  quizProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Palette.border,
    borderRadius: 3,
    marginRight: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: Palette.textSecondary,
    width: 40,
    textAlign: 'right',
    fontWeight: '500',
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
