import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mockAIRecommendations } from '@/lib/mocks';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { SectionHeader } from '@/components/ui';

const TYPE_ACCENT: Record<string, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  quiz: { ...Accent.violet, icon: 'document-text' },
  task: { ...Accent.amber, icon: 'list' },
  review: { ...Accent.blue, icon: 'book' },
};

export default function RecommendationsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.aiHeader}>
        <View style={styles.aiIconContainer}>
          <Ionicons name="bulb" size={24} color="#fff" />
        </View>
        <View style={styles.aiInfo}>
          <Text style={styles.aiTitle}>iCARE AI Assistant</Text>
          <Text style={styles.aiDesc}>Personalized learning suggestions from your performance data</Text>
        </View>
      </View>

      <SectionHeader title="Recommended for You" count={mockAIRecommendations.length} />

      {mockAIRecommendations.map((rec) => {
        const accent = TYPE_ACCENT[rec.type] ?? { ...Accent.teal, icon: 'bulb' as const };
        const priority = rec.priority === 'high' ? Accent.red : Accent.amber;

        return (
          <Pressable
            key={rec.id}
            style={({ pressed }) => [styles.recommendationCard, pressed && styles.pressed]}
            onPress={() => {
              if (rec.type === 'quiz') router.push('/tasks/quizzes');
              else if (rec.type === 'task') router.push('/tasks');
            }}
          >
            <View style={styles.recHeader}>
              <View style={[styles.recIconContainer, { backgroundColor: accent.bg }]}>
                <Ionicons name={accent.icon} size={18} color={accent.fg} />
              </View>
              <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                <Text style={[styles.priorityText, { color: priority.fg }]}>{rec.priority}</Text>
              </View>
            </View>
            <Text style={styles.recTitle}>{rec.title}</Text>
            <Text style={styles.recDesc}>{rec.description}</Text>
            <View style={styles.recActionRow}>
              <Text style={styles.recAction}>
                {rec.type === 'quiz' ? 'Start Quiz' : rec.type === 'task' ? 'View Task' : 'Learn More'}
              </Text>
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
    color: '#1E40AF',
    lineHeight: 19,
  },
});
