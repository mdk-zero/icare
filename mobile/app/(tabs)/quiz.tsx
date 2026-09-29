import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchAssessments, StudentAssessment } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ScoreRing } from '@/components/ScoreRing';
import { accuracyAccent, quizAccent } from '@/lib/quiz-style';

type Tab = 'ongoing' | 'completed';

function formatTimeLimit(seconds: number | null): string {
  if (!seconds) return 'Untimed';
  return `${Math.round(seconds / 60)} min`;
}

/** One quiz in the list: its icon, what it is and who set it, and how it went. */
function QuizRow({
  quiz,
  onPress,
  styles,
}: {
  quiz: StudentAssessment;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { Palette, Accent } = useTheme();
  const done = quiz.attempt_count > 0;
  const tone = quizAccent(Accent, quiz.id);
  const due = quiz.assignment?.deadline
    ? new Date(quiz.assignment.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={quiz.title}
    >
      <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={done ? 'ribbon' : 'medkit'} size={20} color={tone.fg} />
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {quiz.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {quiz.question_count} questions · {formatTimeLimit(quiz.time_limit_seconds)}
          {quiz.author_name ? ` · ${quiz.author_name}` : ''}
        </Text>
        <View style={styles.chips}>
          {quiz.assignment?.required && !done ? (
            <Text style={[styles.chip, { color: Accent.red.fg, backgroundColor: Accent.red.bg }]}>Required</Text>
          ) : null}
          {done ? (
            <Text style={styles.chip}>
              {quiz.attempt_count} {quiz.attempt_count === 1 ? 'attempt' : 'attempts'}
            </Text>
          ) : (
            <Text style={styles.chip}>{due ? `Due ${due}` : 'Not started'}</Text>
          )}
          <Text style={styles.chip} numberOfLines={1}>
            {quiz.category}
          </Text>
        </View>
      </View>

      {done && quiz.best_score !== null ? (
        <ScoreRing score={quiz.best_score} size={50} stroke={5} color={accuracyAccent(Accent, quiz.best_score).fg} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Palette.textFaint} />
      )}
    </Pressable>
  );
}

export default function QuizScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchAssessments);
  const [tab, setTab] = React.useState<Tab>('ongoing');

  // Refresh scores/attempt counts when returning from a quiz.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  if (loading && !data) {
    return <SkeletonScreen topOffset={insets.top + 88} />;
  }

  const assessments = data ?? [];
  const ongoing = assessments.filter((q) => q.attempt_count === 0);
  const completed = assessments.filter((q) => q.attempt_count > 0);
  const shown = tab === 'ongoing' ? ongoing : completed;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'ongoing', label: 'On going', count: ongoing.length },
    { key: 'completed', label: 'Completed', count: completed.length },
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
      <ScreenHeader title="Quizzes" icon="school-outline" accent="teal" />

      <View style={styles.segment} accessibilityRole="tablist">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
              <Text style={[styles.segmentCount, active && styles.segmentCountActive]}>{t.count}</Text>
            </Pressable>
          );
        })}
      </View>

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}

      {shown.length === 0 && !error ? (
        <EmptyState
          icon={tab === 'ongoing' ? 'checkmark-done-circle-outline' : 'document-text-outline'}
          message={
            tab === 'ongoing'
              ? completed.length > 0
                ? 'All caught up — check back when your instructor publishes a new quiz.'
                : 'No quizzes yet — check back once your instructor publishes one.'
              : 'Quizzes you finish land here, with your best score and flashcards to study.'
          }
        />
      ) : (
        <View style={styles.list}>
          {shown.map((quiz) => (
            <QuizRow key={quiz.id} quiz={quiz} onPress={() => router.push(`/quiz-info/${quiz.id}`)} styles={styles} />
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
    container: { flex: 1, backgroundColor: Palette.background },
    content: {
      padding: Spacing.lg,
      // clears the floating tab bar so the last items can scroll above it
      paddingBottom: 128,
    },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    segment: {
      flexDirection: 'row',
      backgroundColor: Palette.borderLight,
      borderRadius: Radius.pill,
      padding: 4,
      marginBottom: Spacing.lg,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: Radius.pill,
    },
    segmentItemActive: { backgroundColor: Palette.surface, ...Shadow.card },
    segmentText: { fontSize: 13, fontWeight: '600', color: Palette.textMuted },
    segmentTextActive: { color: Palette.primary, fontWeight: '800' },
    segmentCount: { fontSize: 12, fontWeight: '700', color: Palette.textFaint },
    segmentCountActive: { color: Palette.primary },
    list: { gap: Spacing.sm + 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      ...Shadow.card,
    },
    rowIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowTitle: { ...Type.itemTitle, fontSize: 14.5, fontWeight: '700', lineHeight: 19 },
    rowMeta: { fontSize: 12, color: Palette.textMuted, marginTop: 3 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
    chip: {
      fontSize: 10.5,
      fontWeight: '700',
      color: Palette.textSecondary,
      backgroundColor: Palette.borderLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radius.pill,
      overflow: 'hidden',
      maxWidth: 160,
    },
  });
}
