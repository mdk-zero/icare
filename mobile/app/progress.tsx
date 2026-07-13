import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Card, StatCard, SectionHeader } from '@/components/ui';
import { Accent, Palette, Spacing } from '@/constants/theme';
import { mockPerformanceLogs, getPerformanceByCategory } from '@/lib/mocks';

function scoreColor(score: number) {
  if (score >= 70) return Accent.green.fg;
  if (score >= 50) return Accent.amber.fg;
  return Accent.red.fg;
}

export default function ProgressScreen() {
  const categoryStats = getPerformanceByCategory();
  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );

  const recentLogs = [...mockPerformanceLogs].reverse().slice(0, 7);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <StatCard title="Overall Score" value={`${avgScore}%`} icon="bar-chart" color={scoreColor(avgScore)} />
        </View>
        <View style={styles.statItem}>
          <StatCard title="Activities" value={mockPerformanceLogs.length} icon="pulse" color={Palette.primary} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="By Category" />
        <Card>
          {categoryStats.map((stat, index) => (
            <View key={stat.category} style={[styles.categoryItem, index > 0 && styles.rowBorder]}>
              <Text style={styles.categoryName}>{stat.category}</Text>
              <View style={styles.categoryScore}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${stat.avgScore}%`, backgroundColor: scoreColor(stat.avgScore) },
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
        <SectionHeader title="Recent Activity" />
        <Card>
          {recentLogs.map((log, index) => (
            <View key={log.id} style={[styles.activityItem, index > 0 && styles.rowBorder]}>
              <View style={styles.activityDate}>
                <Text style={styles.activityDateText}>{new Date(log.date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityComp}>{log.competency}</Text>
                <Text style={[styles.activityScore, { color: scoreColor(log.score) }]}>{log.score}%</Text>
              </View>
            </View>
          ))}
        </Card>
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
    color: '#1E293B',
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
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  activityDate: {
    width: 90,
  },
  activityDateText: {
    fontSize: 12,
    color: Palette.textMuted,
  },
  activityInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityComp: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    flex: 1,
    marginRight: Spacing.sm,
  },
  activityScore: {
    fontSize: 14,
    fontWeight: '700',
  },
});
