import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, PrimaryButton, StatCard } from '@/components/ui';
import { mockQuizzes } from '@/lib/api';
import { Colors } from '@/constants/theme';

const primaryColor = Colors.light.primary;

export default function QuizzesScreen() {
  const router = useRouter();

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '#16a34a';
      case 'intermediate': return '#d97706';
      case 'advanced': return '#dc2626';
      default: return '#6b7280';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <View style={styles.headerBadge}>
                <Ionicons name="school" size={12} color="#7c3aed" />
                <Text style={styles.headerBadgeText}>Adaptive Learning</Text>
              </View>
              <Text style={styles.title}>Adaptive Quizzes</Text>
              <Text style={styles.subtitle}>Personalized questions based on your knowledge gaps</Text>
            </View>
          </View>
        </View>
      </View>

      {mockQuizzes.filter(q => q.completedCount < q.questionsCount).length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Quizzes</Text>
          <View style={styles.quizList}>
            {mockQuizzes.filter(q => q.completedCount < q.questionsCount).map((quiz) => (
              <TouchableOpacity
                key={quiz.id}
                style={styles.quizCard}
                onPress={() => router.push(`/tasks/quizzes/${quiz.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.quizHeader}>
                  <View style={[styles.quizIcon, { backgroundColor: `${getDifficultyColor(quiz.difficulty)}15` }]}>
                    <Ionicons name="document-text" size={20} color={getDifficultyColor(quiz.difficulty)} />
                  </View>
                  <View style={styles.quizInfo}>
                    <Text style={styles.quizTitle}>{quiz.title}</Text>
                    <Text style={styles.quizDesc} numberOfLines={1}>{quiz.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </View>
                <View style={styles.quizMeta}>
                  <View style={[styles.categoryBadge, { backgroundColor: '#f1f5f9' }]}>
                    <Text style={styles.categoryText}>{quiz.category}</Text>
                  </View>
                  <View style={[styles.difficultyBadge, { backgroundColor: `${getDifficultyColor(quiz.difficulty)}15` }]}>
                    <View style={[styles.difficultyDot, { backgroundColor: getDifficultyColor(quiz.difficulty) }]} />
                    <Text style={[styles.difficultyText, { color: getDifficultyColor(quiz.difficulty) }]}>{quiz.difficulty}</Text>
                  </View>
                </View>
                <View style={styles.quizProgress}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(quiz.completedCount / quiz.questionsCount) * 100}%`, backgroundColor: getDifficultyColor(quiz.difficulty) }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {quiz.completedCount}/{quiz.questionsCount}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.emptySection}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          </View>
          <Text style={styles.emptyTitle}>All Quizzes Completed!</Text>
          <Text style={styles.emptyText}>Check back later for new quizzes.</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Completed</Text>
        <View style={styles.quizList}>
          {mockQuizzes.filter(q => q.completedCount >= q.questionsCount).map((quiz) => (
            <TouchableOpacity key={quiz.id} style={[styles.quizCard, styles.quizCardCompleted]} activeOpacity={0.7}>
              <View style={styles.quizHeader}>
                <View style={[styles.quizIcon, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="checkmark" size={20} color="#16a34a" />
                </View>
                <View style={styles.quizInfo}>
                  <Text style={[styles.quizTitle, styles.quizTitleCompleted]}>{quiz.title}</Text>
                  <Text style={styles.quizDesc} numberOfLines={1}>{quiz.description}</Text>
                </View>
              </View>
              <View style={styles.completedRow}>
                <View style={[styles.scoreBadge, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="trophy" size={14} color="#16a34a" />
                  <Text style={styles.scoreText}>{quiz.lastScore}%</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 20 },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
    marginLeft: 4,
  },
  
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  quizList: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  quizCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  quizCardCompleted: { opacity: 0.7, borderColor: '#f1f5f9' },
  quizHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  quizIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quizInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  quizTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  quizTitleCompleted: { textDecorationLine: 'line-through', color: '#94a3b8' },
  quizDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  quizMeta: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  categoryText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  difficultyBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  difficultyDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  difficultyText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  quizProgress: { flexDirection: 'row', alignItems: 'center' },
  progressBar: { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginRight: 10 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#64748b', width: 40, textAlign: 'right', fontWeight: '500' },
  completedRow: { marginTop: 4 },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start' },
  scoreText: { fontSize: 13, fontWeight: '700', color: '#16a34a', marginLeft: 4 },
  emptySection: { alignItems: 'center', padding: 40 },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
});