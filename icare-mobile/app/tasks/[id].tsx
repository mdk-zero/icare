import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Badge } from '@/components/ui';
import { mockTasks } from '@/lib/api';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const taskId = id as string;
  
  const task = mockTasks.find((t) => t.id === taskId);

  if (!task) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  const handleComplete = () => {
    Alert.alert('Complete Task', 'Mark this task as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => router.back() },
    ]);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#dc2626';
      case 'medium': return '#d97706';
      case 'low': return '#16a34a';
      default: return '#6b7280';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Badge
          label={task.status === 'completed' ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'Pending'}
          variant={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'warning' : 'default'}
        />
        <Badge label={task.priority} variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'success'} />
      </View>

      <Text style={styles.title}>{task.title}</Text>
      <Text style={styles.patientName}>Patient: {task.patientName}</Text>

      <Card style={styles.descriptionCard}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.description}>{task.description}</Text>
      </Card>

      <Card style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Category</Text>
          <Text style={styles.detailValue}>{task.category}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Priority</Text>
          <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
          <Text style={styles.detailValue}>{task.priority}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Due Date</Text>
          <Text style={styles.detailValue}>
            {new Date(task.dueDate).toLocaleString()}
          </Text>
        </View>
      </Card>

      {task.status !== 'completed' && (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>Mark as Complete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6b7280' },
  header: { flexDirection: 'row', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#11181c', marginBottom: 8 },
  patientName: { fontSize: 16, color: '#6b7280', marginBottom: 24 },
  descriptionCard: { marginBottom: 16 },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  description: { fontSize: 14, color: '#11181c', lineHeight: 22 },
  detailsCard: { marginBottom: 24 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#11181c' },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  completeButton: { backgroundColor: '#1B6B7B', borderRadius: 12, padding: 16, alignItems: 'center' },
  completeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});