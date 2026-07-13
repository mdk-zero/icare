import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { SectionHeader } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { mockPerformanceLogs, mockAIRecommendations } from '@/lib/mocks';

function getInitials(name?: string) {
  if (!name) return 'S';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function competencyAccent(score: number) {
  if (score >= 70) return { ...Accent.green, label: 'Proficient' };
  if (score >= 50) return { ...Accent.amber, label: 'Developing' };
  return { ...Accent.red, label: 'Needs Work' };
}

const REC_ACCENT: Record<string, { fg: string; bg: string; icon: 'document-text' | 'list' | 'book' }> = {
  quiz: { ...Accent.violet, icon: 'document-text' },
  task: { ...Accent.amber, icon: 'list' },
  resource: { ...Accent.blue, icon: 'book' },
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );

  const competencies = Object.entries(
    mockPerformanceLogs.reduce((acc, log) => {
      if (!acc[log.competency]) acc[log.competency] = [];
      acc[log.competency].push(log.score);
      return acc;
    }, {} as Record<string, number[]>)
  ).map(([competency, scores]) => ({
    competency,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  const quickLinks = [
    { label: 'Performance Analytics', icon: 'bar-chart' as const, accent: Accent.blue, onPress: () => router.push('/progress') },
    { label: 'Notifications', icon: 'notifications' as const, accent: Accent.amber, onPress: () => router.push('/notifications') },
    { label: 'Clinical Guidelines', icon: 'book' as const, accent: Accent.green, onPress: undefined },
    { label: 'Help & Support', icon: 'help-circle' as const, accent: Accent.violet, onPress: undefined },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerCard}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.pressedDim]}>
            <Ionicons name="camera" size={14} color={Palette.primary} />
          </Pressable>
        </View>
        <Text style={styles.name}>{user?.name || 'Student'}</Text>
        <Text style={styles.email}>{user?.email || 'student@icare.edu'}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: Palette.primaryTint }]}>
            <Ionicons name="school-outline" size={12} color={Palette.primary} />
            <Text style={[styles.badgeText, { color: Palette.primary }]}>{user?.cohort || 'BSN-2027'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: Palette.borderLight }]}>
            <Ionicons name="id-card-outline" size={12} color={Palette.textSecondary} />
            <Text style={[styles.badgeText, { color: Palette.textSecondary }]}>
              {user?.studentId || 'NS-2024-001'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Performance Overview" />
        <View style={styles.statsCard}>
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Palette.primaryTint }]}>
              <Ionicons name="trending-up" size={18} color={Palette.primary} />
            </View>
            <Text style={[styles.perfValue, { color: Palette.primary }]}>{avgScore}%</Text>
            <Text style={styles.perfLabel}>Avg Score</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Accent.violet.bg }]}>
              <Ionicons name="analytics" size={18} color={Accent.violet.fg} />
            </View>
            <Text style={styles.perfValue}>{mockPerformanceLogs.length}</Text>
            <Text style={styles.perfLabel}>Activities</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Accent.blue.bg }]}>
              <Ionicons name="ribbon" size={18} color={Accent.blue.fg} />
            </View>
            <Text style={styles.perfValue}>{competencies.length}</Text>
            <Text style={styles.perfLabel}>Skills</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Competencies" />
        <View style={styles.listCard}>
          {competencies.map((comp, index) => {
            const accent = competencyAccent(comp.avgScore);
            return (
              <View
                key={comp.competency}
                style={[styles.compItem, index > 0 && styles.rowBorder]}
              >
                <View style={styles.compLeft}>
                  <Text style={styles.compName}>{comp.competency}</Text>
                  <View style={styles.compScore}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${comp.avgScore}%`, backgroundColor: accent.fg },
                        ]}
                      />
                    </View>
                    <Text style={styles.compValue}>{comp.avgScore}%</Text>
                  </View>
                </View>
                <View style={[styles.compBadge, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.compBadgeText, { color: accent.fg }]}>{accent.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="AI Recommendations" actionLabel="See all" onAction={() => router.push('/recommendations')} />
        <View style={styles.listCard}>
          {mockAIRecommendations.slice(0, 2).map((rec, index) => {
            const accent = REC_ACCENT[rec.type] ?? REC_ACCENT.resource;
            const priority = rec.priority === 'high' ? Accent.red : Accent.amber;
            return (
              <Pressable
                key={rec.id}
                style={({ pressed }) => [styles.recItem, index > 0 && styles.rowBorder, pressed && styles.pressedDim]}
                onPress={() => router.push('/recommendations')}
              >
                <View style={styles.recHeader}>
                  <View style={[styles.recIconContainer, { backgroundColor: accent.bg }]}>
                    <Ionicons name={accent.icon} size={15} color={accent.fg} />
                  </View>
                  <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                    <Text style={[styles.priorityText, { color: priority.fg }]}>{rec.priority}</Text>
                  </View>
                </View>
                <Text style={styles.recTitle}>{rec.title}</Text>
                <Text style={styles.recDesc} numberOfLines={2}>
                  {rec.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Quick Links" />
        <View style={styles.listCard}>
          {quickLinks.map((link, index) => (
            <Pressable
              key={link.label}
              style={({ pressed }) => [styles.linkItem, index > 0 && styles.rowBorder, pressed && styles.pressedDim]}
              onPress={link.onPress}
            >
              <View style={[styles.linkIconContainer, { backgroundColor: link.accent.bg }]}>
                <Ionicons name={link.icon} size={17} color={link.accent.fg} />
              </View>
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedDim]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={19} color={Accent.red.fg} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>

      <Text style={styles.footer}>
        iCARE++ v1.0 • Protected by Philippine Data Privacy Act of 2012
      </Text>
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
  pressedDim: {
    opacity: 0.7,
  },
  headerCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  avatarRow: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
  },
  name: {
    ...Type.screenTitle,
    fontSize: 22,
  },
  email: {
    fontSize: 13,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  perfStat: {
    alignItems: 'center',
    flex: 1,
  },
  perfIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  perfDivider: {
    width: 1,
    backgroundColor: Palette.borderLight,
  },
  perfValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Palette.ink,
  },
  perfLabel: {
    ...Type.micro,
    fontWeight: '500',
    marginTop: 2,
  },
  listCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  compItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  compLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  compName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  compScore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    width: 88,
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
  compValue: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  compBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  compBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  recItem: {
    paddingVertical: Spacing.md,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  recIconContainer: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 3,
  },
  recDesc: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 18,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md + 2,
  },
  linkIconContainer: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginBottom: Spacing.xl,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: Accent.red.fg,
  },
  footer: {
    ...Type.micro,
    textAlign: 'center',
  },
});
