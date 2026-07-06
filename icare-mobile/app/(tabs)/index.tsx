import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { Card, Badge, StatCard } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { mockTasks, mockPerformanceLogs, mockQuizzes } from '@/lib/api';

const primaryColor = Colors.light.primary;

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

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const pendingTasks = mockTasks.filter((t) => t.status !== 'completed').length;
  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );
  const quizzesAvailable = mockQuizzes.filter((q) => q.completedCount < q.questionsCount).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[primaryColor]} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View style={styles.welcomeBadge}>
              <Ionicons name="sparkles" size={12} color="#f59e0b" />
              <Text style={styles.welcomeBadgeText}>Welcome back</Text>
            </View>
            <Text style={styles.greeting}>Good {getGreeting()},</Text>
            <Text style={styles.name}>{user?.name || 'Student'}</Text>
            <View style={styles.dateContainer}>
              <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.avatarButton}>
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.sectionLabel}>Overview</Text>
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/tasks')}
            activeOpacity={0.7}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIconContainer, { backgroundColor: primaryColor + '15' }]}>
                <Ionicons name="clipboard-outline" size={24} color={primaryColor} />
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
            <Text style={[styles.statValue, { color: primaryColor }]}>{pendingTasks}</Text>
            <Text style={styles.statLabel}>Pending Tasks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/progress')}
            activeOpacity={0.7}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIconContainer, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="trending-up" size={24} color="#16a34a" />
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
            <Text style={[styles.statValue, { color: '#16a34a' }]}>{avgScore}%</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/tasks/quizzes')}
            activeOpacity={0.7}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIconContainer, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="document-text-outline" size={24} color="#7c3aed" />
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
            <Text style={[styles.statValue, { color: '#7c3aed' }]}>{quizzesAvailable}</Text>
            <Text style={styles.statLabel}>Quizzes Available</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/ehr')}
            activeOpacity={0.7}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIconContainer, { backgroundColor: '#cffafe' }]}>
                <Ionicons name="people-outline" size={24} color="#0891b2" />
              </View>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
            <Text style={[styles.statValue, { color: '#0891b2' }]}>5</Text>
            <Text style={styles.statLabel}>Total Patients</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickAction} 
            onPress={() => router.push('/vitals')}
            activeOpacity={0.7}
          >
            <View style={styles.quickActionInner}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="heart" size={22} color="#dc2626" />
              </View>
              <Text style={styles.quickActionText}>Vitals</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickAction} 
            onPress={() => router.push('/tasks')}
            activeOpacity={0.7}
          >
            <View style={styles.quickActionInner}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="list" size={22} color="#d97706" />
              </View>
              <Text style={styles.quickActionText}>Tasks</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickAction} 
            onPress={() => router.push('/tasks/quizzes')}
            activeOpacity={0.7}
          >
            <View style={styles.quickActionInner}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="document-text" size={22} color="#7c3aed" />
              </View>
              <Text style={styles.quickActionText}>Quizzes</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickAction} 
            onPress={() => router.push('/recommendations')}
            activeOpacity={0.7}
          >
            <View style={styles.quickActionInner}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="bulb-outline" size={22} color="#2563eb" />
              </View>
              <Text style={styles.quickActionText}>AI Tips</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Today's Tasks</Text>
            <Text style={styles.sectionSubtitle}>{mockTasks.filter(t => t.status !== 'completed').length} pending</Text>
          </View>
          <TouchableOpacity style={styles.seeAllButton} onPress={() => router.push('/tasks')}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="arrow-forward" size={14} color={primaryColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.taskList}>
          {mockTasks.slice(0, 3).map((task, index) => (
            <TouchableOpacity
              key={task.id}
              style={styles.taskItem}
              onPress={() => router.push(`/tasks/${task.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.taskStatusDot, { 
                backgroundColor: task.status === 'completed' ? '#22c55e' : task.status === 'in_progress' ? '#f59e0b' : '#94a3b8'
              }]} />
              <View style={styles.taskContent}>
                <View style={styles.taskHeader}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                </View>
                <View style={styles.taskMeta}>
                  <View style={styles.taskPatientRow}>
                    <Ionicons name="person-outline" size={12} color="#64748b" />
                    <Text style={styles.taskPatient}>{task.patientName}</Text>
                  </View>
                  <View style={styles.taskDueRow}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.taskDue}>
                      {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'center',
  },
  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  welcomeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
    marginLeft: 4,
  },
  greeting: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dateIconBox: {
    marginRight: 6,
  },
  dateText: {
    marginLeft: 4,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  avatarButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: primaryColor,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  alertIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fefce8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  statsContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    height: 200,
    marginRight: '4%',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  statCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: primaryColor + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: primaryColor,
    marginRight: 4,
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  notificationItem: {
    paddingVertical: 12,
  },
  notificationItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  notificationContent: {},
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  taskList: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  taskStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  taskPatient: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  taskDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskDue: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 4,
  },
});
