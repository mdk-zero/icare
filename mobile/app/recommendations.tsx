import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { SectionHeader, SkeletonScreen, EmptyState } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchRecommendations, dismissRecommendation } from '@/lib/api';

function makeRankAccent(Accent: ReturnType<typeof useTheme>['Accent']) {
  return (rank: number) => (rank <= 1 ? Accent.red : rank === 2 ? Accent.amber : Accent.teal);
}

export default function RecommendationsScreen() {
  const router = useRouter();
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchRecommendations);
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const RANK_ACCENT = React.useMemo(() => makeRankAccent(Accent), [Accent]);

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const recommendations = data ?? [];

  const handleDismiss = (id: string) => {
    Alert.alert('Dismiss Recommendation', 'Hide this suggestion?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        onPress: async () => {
          try {
            await dismissRecommendation(id);
            await reload();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Unable to dismiss');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.aiHeader}>
        <View style={styles.aiIconContainer}>
          <Ionicons name="bulb" size={24} color="#fff" />
        </View>
        <View style={styles.aiInfo}>
          <Text style={styles.aiTitle}>iCARE AI Assistant</Text>
          <Text style={styles.aiDesc}>Personalized learning suggestions from your performance data</Text>
        </View>
      </View>

      <SectionHeader title="Recommended for You" count={recommendations.length} />

      {recommendations.length === 0 && (
        <EmptyState
          icon={error ? 'cloud-offline-outline' : 'bulb-outline'}
          message={error ?? 'No recommendations yet — they appear after your quiz results are analyzed.'}
        />
      )}

      {recommendations.map((rec) => {
        const priority = RANK_ACCENT(rec.rank);

        return (
          <Pressable
            key={rec.id}
            style={({ pressed }) => [styles.recommendationCard, pressed && styles.pressed]}
            onPress={() => {
              if (rec.assessments) router.push(`/tasks/quizzes/${rec.assessment_id}`);
              else router.push('/tasks/quizzes');
            }}
            onLongPress={() => handleDismiss(rec.id)}
          >
            <View style={styles.recHeader}>
              <View style={[styles.recIconContainer, { backgroundColor: Accent.violet.bg }]}>
                <Ionicons name="document-text" size={18} color={Accent.violet.fg} />
              </View>
              <View style={styles.recHeaderRight}>
                <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                  <Text style={[styles.priorityText, { color: priority.fg }]}>#{rec.rank}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => handleDismiss(rec.id)}>
                  <Ionicons name="close" size={16} color={Palette.textFaint} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.recTitle}>{rec.assessments?.title ?? 'Recommended practice'}</Text>
            <Text style={styles.recDesc}>{rec.reason}</Text>
            {rec.competency_areas?.name ? (
              <View style={styles.competencyRow}>
                <Ionicons name="school-outline" size={12} color={Palette.textMuted} />
                <Text style={styles.competencyText}>{rec.competency_areas.name}</Text>
              </View>
            ) : null}
            <View style={styles.recActionRow}>
              <Text style={styles.recAction}>Start Quiz</Text>
              <Ionicons name="arrow-forward" size={14} color={Palette.primary} />
            </View>
          </Pressable>
        );
      })}

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={18} color={Accent.blue.fg} />
          <Text style={styles.infoTitle}>How Recommendations Work</Text>
        </View>
        <Text style={styles.infoText}>
          iCARE++ uses machine learning algorithms (Random Forest and Logistic Regression) to analyze
          your performance data and provide personalized recommendations.
        </Text>
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
    paddingBottom: 32,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadow.card,
  },
  aiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  aiInfo: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  aiDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    lineHeight: 17,
  },
  recommendationCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  competencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  competencyText: {
    fontSize: 12,
    color: Palette.textMuted,
  },
  recIconContainer: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  recTitle: {
    ...Type.itemTitle,
    fontWeight: '700',
    marginBottom: 4,
  },
  recDesc: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
  },
  recActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  recAction: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.primary,
    marginRight: 4,
  },
  infoCard: {
    backgroundColor: Accent.blue.bg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Accent.blue.fg,
  },
  infoText: {
    fontSize: 13,
    color: Accent.blue.fg,
    lineHeight: 19,
  },
  });
}
