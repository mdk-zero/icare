import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { mockAIRecommendations } from '@/lib/api';
import { Colors } from '@/constants/theme';

const primaryColor = Colors.light.primary;

export default function RecommendationsScreen() {
  const router = useRouter();

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quiz': return 'document-text';
      case 'task': return 'list';
      case 'review': return 'book';
      default: return 'bulb';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <View style={styles.headerBadge}>
                <Ionicons name="sparkles" size={12} color="#f59e0b" />
                <Text style={styles.headerBadgeText}>AI-Powered</Text>
              </View>
              <Text style={styles.title}>AI Recommendations</Text>
              <Text style={styles.subtitle}>Personalized learning suggestions</Text>
            </View>
          </View>
          <View style={[styles.aiHeader, { backgroundColor: primaryColor }]}>
            <View style={styles.aiIconContainer}>
              <Ionicons name="bulb" size={28} color="#fff" />
            </View>
            <View style={styles.aiInfo}>
              <Text style={styles.aiTitle}>iCARE AI Assistant</Text>
              <Text style={styles.aiDesc}>Machine learning-driven</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recommended for You</Text>

      <View style={styles.recList}>
        {mockAIRecommendations.map((rec, index) => {
          const iconBgColor = rec.type === 'quiz' ? '#ede9fe' : rec.type === 'task' ? '#fef3c7' : '#dbeafe';
          const iconColor = rec.type === 'quiz' ? '#7c3aed' : rec.type === 'task' ? '#d97706' : '#2563eb';
          
          return (
            <TouchableOpacity
              key={rec.id}
              style={styles.recommendationCard}
              onPress={() => {
                if (rec.type === 'quiz') router.push('/tasks/quizzes');
                else if (rec.type === 'task') router.push('/tasks');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.recHeader}>
                <View style={[styles.recIconContainer, { backgroundColor: iconBgColor }]}>
                  <Ionicons name={getTypeIcon(rec.type) as any} size={20} color={iconColor} />
                </View>
                <View style={[styles.priorityBadge, { backgroundColor: rec.priority === 'high' ? '#fee2e2' : '#fef3c7' }]}>
                  <Text style={[styles.priorityText, { color: rec.priority === 'high' ? '#dc2626' : '#d97706' }]}>{rec.priority}</Text>
                </View>
              </View>
              <Text style={styles.recTitle}>{rec.title}</Text>
              <Text style={styles.recDesc}>{rec.description}</Text>
              <View style={styles.recFooter}>
                <View style={styles.recActionRow}>
                  <Text style={styles.recAction}>
                    {rec.type === 'quiz' ? 'Start Quiz' : rec.type === 'task' ? 'View Task' : 'Learn More'}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={primaryColor} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.infoIconBox}>
            <Ionicons name="information-circle" size={18} color="#0369a1" />
          </View>
          <Text style={styles.infoTitle}>How Recommendations Work</Text>
        </View>
        <Text style={styles.infoText}>
          iCARE++ uses machine learning algorithms (Random Forest and Logistic Regression) to analyze your performance data and provide personalized recommendations.
        </Text>
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
    marginBottom: 16,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
    marginLeft: 4,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14 },
  aiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiInfo: { flex: 1 },
  aiTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  aiDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  recList: {
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
    marginBottom: 16,
  },
  recommendationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  recHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  recIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  recTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 6 },
  recDesc: { fontSize: 13, color: '#64748b', lineHeight: 20 },
  recFooter: { marginTop: 12 },
  recActionRow: { flexDirection: 'row', alignItems: 'center' },
  recAction: { fontSize: 13, fontWeight: '600', color: primaryColor, marginRight: 4 },
  infoCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#0369a1', marginLeft: 8 },
  infoText: { fontSize: 13, color: '#0369a1', lineHeight: 20 },
});