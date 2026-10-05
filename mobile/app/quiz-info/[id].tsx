import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SkeletonBlock, EmptyState, PrimaryButton } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchAssessments } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ScoreRing } from '@/components/ScoreRing';
import { accuracyAccent, PASSING_SCORE } from '@/lib/quiz-style';

/** Teal ramp sampled from the pill logo's cap (same as the app header and profile). */
const Teal = { deepest: '#082E38', deep: '#0D4550', primary: '#1B6B7B' };

function formatTimeLimit(seconds: number | null): string {
  if (!seconds) return 'Untimed';
  return `${Math.round(seconds / 60)} min`;
}

/**
 * A quiz before it's opened: what it is, and what can be done with it. One
 * still to take offers Start quiz; one already taken shows the best score and
 * offers another try (while tries remain) and flashcards to study from.
 */
export default function QuizInfoScreen() {
  const { id } = useLocalSearchParams();
  const quizId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const { data, loading, error, reload } = useApiData(fetchAssessments);

  // Back from an attempt: the score and tries left have changed.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  if (loading && !data) {
    const light = { backgroundColor: 'rgba(255,255,255,0.18)' };
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading the quiz">
        <LinearGradient
          colors={[Teal.deepest, Teal.deep, Teal.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="medkit" size={20} color="#fff" />
            </View>
            <SkeletonBlock width={90} height={10} radius={3} style={light} />
          </View>
          <SkeletonBlock width="85%" height={20} radius={5} style={[light, { marginTop: Spacing.md }]} />
          <SkeletonBlock width="50%" height={20} radius={5} style={[light, { marginTop: 6 }]} />
          <SkeletonBlock width="45%" height={12} style={[light, { marginTop: 10 }]} />
        </LinearGradient>
        <View style={styles.stats}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.stat, i > 0 && styles.statDivider]}>
              <SkeletonBlock width={40} height={18} />
              <SkeletonBlock width={60} height={10} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
        <View style={{ gap: 6 }}>
          <SkeletonBlock width="100%" height={13} />
          <SkeletonBlock width="70%" height={13} />
        </View>
        <View style={styles.card}>
          <View style={styles.readyRow}>
            <SkeletonBlock width={18} height={18} radius={9} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBlock width="100%" height={12} />
              <SkeletonBlock width="60%" height={12} />
            </View>
          </View>
          <SkeletonBlock width="100%" height={52} radius={Radius.md} />
        </View>
      </View>
    );
  }

  const quiz = (data ?? []).find((q) => q.id === quizId) ?? null;
  if (!quiz) {
    return (
      <View style={styles.center}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Quiz not found'} />
      </View>
    );
  }

  const done = quiz.attempt_count > 0;
  const exhausted = quiz.attempts_remaining === 0;
  const due = quiz.assignment?.deadline
    ? new Date(quiz.assignment.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null;
  const score = quiz.best_score;
  const passed = score !== null && score >= PASSING_SCORE;

  const stats = [
    { label: 'Questions', value: String(quiz.question_count) },
    { label: 'Time limit', value: formatTimeLimit(quiz.time_limit_seconds) },
    {
      label: quiz.max_attempts !== null ? 'Tries used' : 'Tries · no limit',
      value: quiz.max_attempts !== null ? `${quiz.attempts_used}/${quiz.max_attempts}` : String(quiz.attempts_used),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="medkit" size={20} color="#fff" />
          </View>
          <Text style={styles.heroCategory} numberOfLines={1}>
            {quiz.category}
          </Text>
          {quiz.assignment ? <Text style={styles.heroTag}>Assigned</Text> : null}
        </View>
        <Text style={styles.heroTitle}>{quiz.title}</Text>
        <Text style={styles.heroMeta}>
          {quiz.author_name ? `Set by ${quiz.author_name}` : 'Skill assessment'}
          {due ? ` · Due ${due}` : ''}
        </Text>
      </LinearGradient>

      <View style={styles.stats}>
        {stats.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {quiz.description ? <Text style={styles.description}>{quiz.description}</Text> : null}

      {done ? (
        <View style={styles.card}>
          <View style={styles.scoreRow}>
            {score !== null ? (
              <ScoreRing score={score} size={84} stroke={8} color={accuracyAccent(Accent, score).fg} label="best" />
            ) : null}
            <View style={styles.scoreText}>
              <Text style={styles.scoreTitle}>
                {score === null ? 'Not scored yet' : passed ? 'Passed' : 'Keep practicing'}
              </Text>
              <Text style={styles.scoreBody}>
                {quiz.attempt_count} {quiz.attempt_count === 1 ? 'attempt' : 'attempts'}
                {quiz.last_submitted_at
                  ? ` · last on ${new Date(quiz.last_submitted_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}`
                  : ''}
                . Passing mark is {PASSING_SCORE}%.
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.studyButton, pressed && styles.pressed]}
            onPress={() => router.push(`/flashcards/${quiz.id}`)}
            accessibilityRole="button"
          >
            <View style={[styles.studyIcon, { backgroundColor: Accent.violet.bg }]}>
              <Ionicons name="copy-outline" size={18} color={Accent.violet.fg} />
            </View>
            <View style={styles.studyText}>
              <Text style={styles.studyTitle}>Study flashcards</Text>
              <Text style={styles.studyBody}>Review this quiz&apos;s questions and answers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Palette.textFaint} />
          </Pressable>

          <PrimaryButton
            title={exhausted ? 'No tries left' : 'Take it again'}
            onPress={() => router.push(`/quiz/${quiz.id}`)}
            disabled={exhausted}
            size="lg"
          />
          {exhausted ? (
            <Text style={styles.note}>Ask your instructor if you need another try.</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.readyRow}>
            <Ionicons name="information-circle-outline" size={18} color={Palette.primary} />
            <Text style={styles.readyText}>
              {quiz.time_limit_seconds
                ? `The timer starts when you begin and the quiz submits itself at ${formatTimeLimit(quiz.time_limit_seconds)}.`
                : 'Take your time — this quiz has no time limit.'}{' '}
              You can skip a question and come back to it.
            </Text>
          </View>
          <PrimaryButton
            title={exhausted ? 'No tries left' : 'Start quiz'}
            onPress={() => router.push(`/quiz/${quiz.id}`)}
            disabled={exhausted}
            size="lg"
          />
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
    content: { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },
    center: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    pressed: { opacity: 0.85 },
    hero: { borderRadius: Radius.lg, padding: Spacing.lg, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    heroIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCategory: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: '#9FC8D2', textTransform: 'uppercase' },
    heroTag: {
      fontSize: 10,
      fontWeight: '800',
      color: '#fff',
      backgroundColor: 'rgba(255,255,255,0.18)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.pill,
      overflow: 'hidden',
    },
    heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 26, marginTop: Spacing.md },
    heroMeta: { fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 6 },
    stats: {
      flexDirection: 'row',
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingVertical: Spacing.md,
      ...Shadow.card,
    },
    stat: { flex: 1, alignItems: 'center' },
    statDivider: { borderLeftWidth: 1, borderLeftColor: Palette.borderLight },
    statValue: { fontSize: 17, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] },
    statLabel: { fontSize: 11, color: Palette.textMuted, marginTop: 2 },
    description: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19, paddingHorizontal: 2 },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      gap: Spacing.md,
      ...Shadow.card,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
    scoreText: { flex: 1 },
    scoreTitle: { ...Type.title, fontSize: 18 },
    scoreBody: { fontSize: 12, color: Palette.textSecondary, lineHeight: 17, marginTop: 4 },
    studyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.background,
    },
    studyIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    studyText: { flex: 1 },
    studyTitle: { fontSize: 14, fontWeight: '700', color: Palette.ink },
    studyBody: { fontSize: 12, color: Palette.textMuted, marginTop: 1 },
    note: { fontSize: 12, color: Accent.red.fg, textAlign: 'center' },
    readyRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    readyText: { flex: 1, fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
  });
}
