import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mockTasks, mockPerformanceLogs, mockQuizzes } from '@/lib/api';

const { width } = Dimensions.get('window');
const { light: C } = Colors;
const primaryColor = C.primary;

const today = new Date();
const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getInitials(name?: string) {
  if (!name) return 'S';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const STATS_CONFIG = [
  { key: 'tasks', icon: 'clipboard-outline', color: C.primary, tint: '#E8F4F1', label: 'Pending Tasks', route: '/tasks' },
  { key: 'score', icon: 'trending-up', color: C.success, tint: '#E6F7EC', label: 'Avg Score', route: '/progress' },
  { key: 'quizzes', icon: 'document-text-outline', color: '#7c3aed', tint: '#F0EBFF', label: 'Quizzes', route: '/tasks/quizzes' },
  { key: 'patients', icon: 'people-outline', color: '#0891b2', tint: '#E6F9FC', label: 'Patients', route: '/ehr' },
] as const;

const QUICK_ACTIONS = [
  { key: 'vitals', icon: 'heart', color: '#dc2626', tint: '#FFE8E8', label: 'Vitals', route: '/vitals' },
  { key: 'tasks', icon: 'list', color: '#d97706', tint: '#FFF3D6', label: 'Tasks', route: '/tasks' },
  { key: 'quizzes', icon: 'document-text', color: '#7c3aed', tint: '#F0EBFF', label: 'Quizzes', route: '/tasks/quizzes' },
  { key: 'tips', icon: 'bulb-outline', color: '#2563eb', tint: '#DBE8FF', label: 'AI Tips', route: '/recommendations' },
] as const;

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const pendingTasks = mockTasks.filter((t) => t.status !== 'completed').length;
  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );
  const quizzesAvailable = mockQuizzes.filter((q) => q.completedCount < q.questionsCount).length;

  const statValues: Record<string, string | number> = {
    tasks: pendingTasks,
    score: `${avgScore}%`,
    quizzes: quizzesAvailable,
    patients: 5,
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />
        }
      >
        <LinearGradient
          colors={['#0F5D5A', '#0D9488']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1.2, y: 1.2 }}
          style={styles.header}
        >
          <View style={styles.headerDecor1} />
          <View style={styles.headerDecor2} />
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <View style={styles.welcomeChip}>
                <Ionicons name="sparkles" size={13} color="#FDE68A" />
                <Text style={styles.welcomeChipText}>Welcome back</Text>
              </View>
              <TouchableOpacity style={styles.avatarBtn}>
                <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.greeting}>Good {getGreeting()},</Text>
            <Text style={styles.name}>{user?.name || 'Student'}</Text>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsGrid}>
          {STATS_CONFIG.map((stat) => (
            <TouchableOpacity
              key={stat.key}
              style={styles.statCard}
              onPress={() => router.push(stat.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconBox, { backgroundColor: stat.tint }]}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: stat.color }]}>{statValues[stat.key]}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.quickActionItem}
                onPress={() => router.push(action.route)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: action.tint }]}>
                  <Ionicons name={action.icon as any} size={22} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
              <Text style={styles.sectionSub}>{pendingTasks} pending</Text>
            </View>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => router.push('/tasks')}>
              <Text style={styles.seeAllText}>See all</Text>
              <Ionicons name="arrow-forward" size={13} color={C.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.taskCard}>
            {mockTasks.slice(0, 3).map((task, index) => {
              const statusColor = task.status === 'completed' ? C.success : task.status === 'in_progress' ? C.warning : '#94a3b8';
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskItem, index < Math.min(3, mockTasks.length) - 1 && styles.taskItemBorder]}
                  onPress={() => router.push(`/tasks/${task.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.taskDot, { backgroundColor: statusColor }]} />
                  <View style={styles.taskContent}>
                    <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                    <View style={styles.taskMeta}>
                      <View style={styles.taskMetaItem}>
                        <Ionicons name="person-outline" size={11} color="#94a3b8" />
                        <Text style={styles.taskMetaText}>{task.patientName}</Text>
                      </View>
                      <View style={styles.taskMetaDivider} />
                      <View style={styles.taskMetaItem}>
                        <Ionicons name="time-outline" size={11} color="#94a3b8" />
                        <Text style={styles.taskMetaText}>
                          {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#dde1e6" />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.streakSection}>
          <View style={styles.streakCard}>
            <View style={styles.streakLeft}>
              <View style={styles.streakIconBox}>
                <Ionicons name="flame" size={24} color="#f59e0b" />
              </View>
              <View>
                <Text style={styles.streakValue}>5-day streak</Text>
                <Text style={styles.streakLabel}>Keep it going!</Text>
              </View>
            </View>
            <View style={styles.streakDots}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.streakDot,
                    i < 5 && styles.streakDotActive,
                    i === 4 && styles.streakDotToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.streakDotText,
                      i < 5 && styles.streakDotTextActive,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDecor2: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerContent: {
    position: 'relative',
    zIndex: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  welcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  welcomeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FDE68A',
  },
  avatarBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginTop: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 5,
  },
  dateText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: -18,
    gap: 10,
  },
  statCard: {
    width: (width - 42) / 2,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27,107,123,0.08)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 4,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.primary,
  },
  quickActionsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  quickActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  taskItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 5,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskMetaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  taskMetaDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#dde1e6',
    marginHorizontal: 10,
  },
  streakSection: {
    paddingHorizontal: 16,
    marginTop: 22,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  streakLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  streakDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakDotActive: {
    backgroundColor: C.primary,
  },
  streakDotToday: {
    borderWidth: 2,
    borderColor: '#0F5D5A',
  },
  streakDotText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
  },
  streakDotTextActive: {
    color: '#fff',
  },
});