import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui';
import { mockTasks, mockQuizzes } from '@/lib/api';

const primaryColor = Colors.light.primary;

export default function TasksScreen() {
  const router = useRouter();

  const pendingTasks = mockTasks.filter((t) => t.status === 'pending');
  const inProgressTasks = mockTasks.filter((t) => t.status === 'in_progress');
  const completedTasks = mockTasks.filter((t) => t.status === 'completed');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#dc2626';
      case 'medium': return '#d97706';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.headerBadge}>
              <Ionicons name="clipboard" size={12} color={primaryColor} />
              <Text style={styles.headerBadgeText}>Tasks</Text>
            </View>
            <Text style={styles.title}>Clinical Tasks</Text>
            <Text style={styles.subtitle}>
              {mockTasks.filter(t => t.status !== 'completed').length} tasks remaining
            </Text>
          </View>
          <View style={styles.headerIconBox}>
            <Ionicons name="clipboard-outline" size={24} color={primaryColor} />
          </View>
        </View>
      </View>

      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/tasks/quizzes')}>
          <View style={[styles.quickLinkIcon, { backgroundColor: '#ede9fe' }]}>
            <Ionicons name="document-text" size={20} color="#7c3aed" />
          </View>
          <Text style={styles.quickLinkText}>Quizzes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/recommendations')}>
          <View style={[styles.quickLinkIcon, { backgroundColor: '#dbeafe' }]}>
            <Ionicons name="bulb" size={20} color="#2563eb" />
          </View>
          <Text style={styles.quickLinkText}>AI Tips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/notifications')}>
          <View style={[styles.quickLinkIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="notifications" size={20} color="#d97706" />
          </View>
          <Text style={styles.quickLinkText}>Alerts</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.sectionTitle}>In Progress</Text>
            <View style={[styles.sectionBadge, { backgroundColor: '#fef3c7' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#d97706' }]}>{inProgressTasks.length}</Text>
            </View>
          </View>
        </View>
        <View style={styles.taskList}>
          {inProgressTasks.length > 0 ? (
            inProgressTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskCard}
                onPress={() => router.push(`/tasks/${task.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskHeaderLeft}>
                    <View style={[styles.taskIconBox, { backgroundColor: '#fef3c7' }]}>
                      <Ionicons name="ellipse" size={14} color="#d97706" />
                    </View>
                    <View>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <View style={styles.taskPatientRow}>
                        <Ionicons name="person-outline" size={12} color="#64748b" />
                        <Text style={styles.taskPatient}>{task.patientName}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </View>
                <Text style={styles.taskDescription} numberOfLines={2}>
                  {task.description}
                </Text>
                <View style={styles.taskFooter}>
                  <View style={[styles.priorityPill, { backgroundColor: getPriorityColor(task.priority) + '15' }]}>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                    <Text style={[styles.priorityText, { color: getPriorityColor(task.priority) }]}>
                      {task.priority}
                    </Text>
                  </View>
                  <View style={styles.dueRow}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.taskDue}>
                      {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={36} color="#cbd5e1" />
              <Text style={styles.emptyText}>No tasks in progress</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionDot, { backgroundColor: '#64748b' }]} />
            <Text style={styles.sectionTitle}>Pending</Text>
            <View style={[styles.sectionBadge, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#64748b' }]}>{pendingTasks.length}</Text>
            </View>
          </View>
        </View>
        <View style={styles.taskList}>
          {pendingTasks.length > 0 ? (
            pendingTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskCard}
                onPress={() => router.push(`/tasks/${task.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskHeaderLeft}>
                    <View style={[styles.taskIconBox, { backgroundColor: '#f1f5f9' }]}>
                      <Ionicons name="ellipse-outline" size={14} color="#64748b" />
                    </View>
                    <View>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <View style={styles.taskPatientRow}>
                        <Ionicons name="person-outline" size={12} color="#64748b" />
                        <Text style={styles.taskPatient}>{task.patientName}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </View>
                <Text style={styles.taskDescription} numberOfLines={2}>
                  {task.description}
                </Text>
                <View style={styles.taskFooter}>
                  <View style={[styles.priorityPill, { backgroundColor: getPriorityColor(task.priority) + '15' }]}>
                    <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                    <Text style={[styles.priorityText, { color: getPriorityColor(task.priority) }]}>
                      {task.priority}
                    </Text>
                  </View>
                  <View style={styles.dueRow}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.taskDue}>
                      {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle" size={36} color="#16a34a" />
              <Text style={styles.emptyTextSuccess}>All tasks completed!</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionDot, { backgroundColor: '#16a34a' }]} />
            <Text style={styles.sectionTitle}>Completed</Text>
            <View style={[styles.sectionBadge, { backgroundColor: '#dcfce7' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#16a34a' }]}>{completedTasks.length}</Text>
            </View>
          </View>
        </View>
        <View style={styles.taskList}>
          {completedTasks.length > 0 ? (
            completedTasks.slice(0, 2).map((task) => (
              <TouchableOpacity
                key={task.id}
                style={[styles.taskCard, styles.taskCardCompleted]}
                onPress={() => router.push(`/tasks/${task.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskHeaderLeft}>
                    <View style={[styles.taskIconBox, { backgroundColor: '#dcfce7' }]}>
                      <Ionicons name="checkmark" size={14} color="#16a34a" />
                    </View>
                    <View>
                      <Text style={[styles.taskTitle, styles.taskTitleCompleted]}>{task.title}</Text>
                      <View style={styles.taskPatientRow}>
                        <Ionicons name="person-outline" size={12} color="#94a3b8" />
                        <Text style={[styles.taskPatient, styles.taskPatientCompleted]}>{task.patientName}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No completed tasks yet</Text>
            </View>
          )}
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
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
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
    backgroundColor: primaryColor + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: primaryColor,
    marginLeft: 4,
  },
  headerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: primaryColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  quickLinks: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  quickLink: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginRight: 8,
  },
  sectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskList: {
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
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  taskCardCompleted: {
    opacity: 0.7,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  taskPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  taskPatient: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  taskPatientCompleted: {
    color: '#94a3b8',
  },
  taskDescription: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
    lineHeight: 18,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskDue: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
  emptyTextSuccess: {
    fontSize: 14,
    color: '#16a34a',
    marginTop: 8,
    fontWeight: '600',
  },
});