import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, StatCard, SectionHeader, SkeletonBlock } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchProgress, type ProgressAttempt } from '@/lib/api';

interface QuizGroup {
  key: string;
  title: string;
  /** Newest first. */
  attempts: ProgressAttempt[];
}

/** Retakes of one quiz, together (by its id, else its title); the most recently taken quiz first. */
function groupAttempts(attempts: ProgressAttempt[]): QuizGroup[] {
  const groups = new Map<string, QuizGroup>();
  for (const attempt of attempts) {
    const title = attempt.assessments?.title ?? 'Quiz';
    const key = attempt.assessment_id ?? `title:${title}`;
    const group = groups.get(key) ?? { key, title, attempts: [] };
    group.attempts.push(attempt);
    groups.set(key, group);
  }
  const time = (a: ProgressAttempt) => new Date(a.submitted_at).getTime();
  for (const group of groups.values()) group.attempts.sort((a, b) => time(b) - time(a));
  return [...groups.values()].sort((a, b) => time(b.attempts[0]) - time(a.attempts[0]));
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function makeScoreColor(Accent: ReturnType<typeof useTheme>['Accent']) {
  return (score: number) => {
    if (score >= 70) return Accent.green.fg;
    if (score >= 50) return Accent.amber.fg;
    return Accent.red.fg;
  };
}

/**
 * One quiz, however many times it was taken: the latest score, and for a
 * retaken quiz, a tap opens the score of every attempt.
 */
function QuizHistoryRow({
  group,
  scoreColor,
  styles,
  bordered,
}: {
  group: QuizGroup;
  scoreColor: (score: number) => string;
  styles: ReturnType<typeof createStyles>;
  bordered: boolean;
}) {
  const { Palette } = useTheme();
  const [open, setOpen] = React.useState(false);
  const latest = group.attempts[0];
  const retaken = group.attempts.length > 1;
  const scores = group.attempts.map((a) => a.score).filter((s): s is number => s !== null);
  const best = scores.length > 0 ? Math.max(...scores) : null;

  return (
    <View style={bordered && styles.rowBorder}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={!retaken}
        accessibilityRole={retaken ? 'button' : undefined}
        accessibilityState={retaken ? { expanded: open } : undefined}
        style={({ pressed }) => [styles.quizRow, pressed && styles.pressed]}
      >
        <View style={styles.quizInfo}>
          <Text style={styles.activityComp} numberOfLines={1}>
            {group.title}
          </Text>
          <Text style={styles.activityDateText}>
            {retaken
              ? `${group.attempts.length} attempts${best !== null ? ` · best ${best}%` : ''}`
              : formatDate(latest.submitted_at)}
          </Text>
        </View>
        <Text style={[styles.activityScore, latest.score !== null && { color: scoreColor(latest.score) }]}>
          {latest.score !== null ? `${latest.score}%` : '—'}
        </Text>
        {retaken ? (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Palette.textMuted}
            style={styles.chevron}
          />
        ) : (
          <View style={styles.chevron} />
        )}
      </Pressable>

      {open && (
        <View style={styles.history}>
          {group.attempts.map((attempt, i) => (
            <View key={attempt.id} style={styles.historyRow}>
              <Text style={styles.historyLabel}>Attempt {group.attempts.length - i}</Text>
              <Text style={styles.historyDate}>{formatDate(attempt.submitted_at)}</Text>
              <Text style={[styles.historyScore, attempt.score !== null && { color: scoreColor(attempt.score) }]}>
                {attempt.score !== null ? `${attempt.score}%` : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ProgressScreen() {
  const { data, loading, refreshing, error, refresh } = useApiData(fetchProgress);
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette), [Palette]);
  const scoreColor = React.useMemo(() => makeScoreColor(Accent), [Accent]);

  const pending = loading && !data;

  const attempts = data?.attempts ?? [];
  const competencyScores = data?.competency_scores ?? [];

  const scored = attempts.filter((a) => a.score !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length)
      : 0;

  // Average score per competency area.
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const record of competencyScores) {
    const name = record.competency_areas?.name ?? 'General';
    const entry = byCategory.get(name) ?? { total: 0, count: 0 };
    entry.total += record.score;
    entry.count += 1;
    byCategory.set(name, entry);
  }
  const categoryStats = [...byCategory.entries()].map(([category, { total, count }]) => ({
    category,
    avgScore: Math.round(total / count),
  }));

  const quizzes = groupAttempts(attempts);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <StatCard
            title="Overall Score"
            value={scored.length > 0 ? `${avgScore}%` : '—'}
            icon="bar-chart"
            color={pending ? Palette.primary : scoreColor(avgScore)}
            loading={pending}
          />
        </View>
        <View style={styles.statItem}>
          <StatCard title="Quizzes Taken" value={attempts.length} icon="pulse" color={Palette.primary} loading={pending} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="By Skill Area" />
        <Card>
          {pending &&
            [0, 1, 2].map((index) => (
              <View key={index} style={[styles.categoryItem, index > 0 && styles.rowBorder]}>
                <SkeletonBlock width={["50%", "40%", "55%"][index] as `${number}%`} height={14} />
                <View style={styles.categoryScore}>
                  <View style={styles.progressBar} />
                  <SkeletonBlock width={34} height={13} />
                </View>
              </View>
            ))}
          {!pending && categoryStats.length === 0 && (
            <Text style={styles.emptyText}>
              {error ?? 'No skill area scores yet — they appear as your instructor validates your work.'}
            </Text>
          )}
          {categoryStats.map((stat, index) => (
            <View key={stat.category} style={[styles.categoryItem, index > 0 && styles.rowBorder]}>
              <Text style={styles.categoryName}>{stat.category}</Text>
              <View style={styles.categoryScore}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(stat.avgScore, 100)}%`, backgroundColor: scoreColor(stat.avgScore) },
                    ]}
                  />
                </View>
                <Text style={styles.categoryValue}>{stat.avgScore}%</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Quiz History" count={quizzes.length || undefined} />
        <Card>
          {pending &&
            [0, 1, 2, 3].map((index) => (
              <View key={index} style={[styles.quizRow, index > 0 && styles.rowBorder]}>
                <View style={styles.quizInfo}>
                  <SkeletonBlock width={["70%", "55%", "65%", "50%"][index] as `${number}%`} height={14} />
                  <SkeletonBlock width={90} height={11} style={{ marginTop: 6 }} />
                </View>
                <SkeletonBlock width={38} height={16} />
                <View style={styles.chevron} />
              </View>
            ))}
          {!pending && quizzes.length === 0 && (
            <Text style={styles.emptyText}>No quiz attempts yet — take one from the Quizzes tab.</Text>
          )}
          {quizzes.map((group, index) => (
            <QuizHistoryRow
              key={group.key}
              group={group}
              scoreColor={scoreColor}
              styles={styles}
              bordered={index > 0}
            />
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statItem: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
    flex: 1,
    marginRight: Spacing.md,
  },
  categoryScore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    width: 96,
    height: 6,
    backgroundColor: Palette.border,
    borderRadius: 3,
    marginRight: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  quizRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  quizInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  activityDateText: {
    fontSize: 12,
    color: Palette.textMuted,
    marginTop: 2,
  },
  activityComp: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  activityScore: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.textMuted,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    width: 16,
    marginLeft: Spacing.sm,
  },
  history: {
    marginBottom: Spacing.md,
    borderRadius: 10,
    backgroundColor: Palette.borderLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  historyLabel: {
    width: 80,
    fontSize: 12,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  historyDate: {
    flex: 1,
    fontSize: 12,
    color: Palette.textMuted,
  },
  historyScore: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.textMuted,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontSize: 13,
    color: Palette.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  });
}
