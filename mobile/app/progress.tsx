import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Card, StatCard } from '@/components/ui';
import { mockPerformanceLogs, getPerformanceByCategory } from '@/lib/api';

export default function ProgressScreen() {
  const categoryStats = getPerformanceByCategory();
  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );

  const recentLogs = [...mockPerformanceLogs].reverse().slice(0, 7);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Performance Analytics</Text>
        <Text style={styles.subtitle}>Track your competency development</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <StatCard title="Overall Score" value={`${avgScore}%`} icon="bar-chart" color={avgScore >= 70 ? '#16a34a' : '#dc2626'} />
        </View>
        <View style={styles.statItem}>
          <StatCard title="Activities" value={mockPerformanceLogs.length} icon="fitness-center" color="#1B6B7B" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>By Category</Text>
        <Card>
          {categoryStats.map((stat, index) => (
            <View key={stat.category} style={[styles.categoryItem, index < categoryStats.length - 1 && styles.categoryBorder]}>
              <Text style={styles.categoryName}>{stat.category}</Text>
              <View style={styles.categoryScore}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${stat.avgScore}%`, backgroundColor: stat.avgScore >= 70 ? '#16a34a' : stat.avgScore >= 50 ? '#d97706' : '#dc2626' }]} />
                </View>
                <Text style={styles.categoryValue}>{stat.avgScore}%</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Card>
          {recentLogs.map((log, index) => (
            <View key={log.id} style={[styles.activityItem, index < recentLogs.length - 1 && styles.activityBorder]}>
              <View style={styles.activityDate}>
                <Text style={styles.activityDateText}>{new Date(log.date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityComp}>{log.competency}</Text>
                <Text style={styles.activityScore}>{log.score}%</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#11181c' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  statsGrid: { flexDirection: 'row', marginBottom: 24 },
  statItem: { flex: 1, marginHorizontal: 6 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#11181c', marginBottom: 12 },
  categoryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  categoryBorder: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  categoryName: { fontSize: 14, fontWeight: '500', color: '#11181c', flex: 1 },
  categoryScore: { flexDirection: 'row', alignItems: 'center' },
  progressBar: { width: 100, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, marginRight: 12 },
  progressFill: { height: '100%', borderRadius: 4 },
  categoryValue: { fontSize: 14, fontWeight: '600', color: '#6b7280', width: 40, textAlign: 'right' },
  activityItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  activityDate: { width: 90 },
  activityDateText: { fontSize: 12, color: '#6b7280' },
  activityInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  activityComp: { fontSize: 14, fontWeight: '500', color: '#11181c' },
  activityScore: { fontSize: 14, fontWeight: '600', color: '#1B6B7B' },
});