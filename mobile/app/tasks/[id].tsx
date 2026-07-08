import React from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Badge, PrimaryButton } from '@/components/ui';
import { Accent, Palette, Spacing, Type } from '@/constants/theme';
import { mockTasks } from '@/lib/mocks';

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
      case 'high': return Accent.red.fg;
      case 'medium': return Accent.amber.fg;
      case 'low': return Accent.green.fg;
      default: return Palette.textSecondary;
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
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Due Date</Text>
          <Text style={styles.detailValue}>
            {new Date(task.dueDate).toLocaleString()}
          </Text>
        </View>
      </Card>

      {task.status !== 'completed' && (
        <PrimaryButton title="Mark as Complete" onPress={handleComplete} size="lg" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Palette.background },
  errorText: { fontSize: 16, color: Palette.textSecondary },
  header: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  title: { ...Type.screenTitle, marginBottom: Spacing.sm },
  patientName: { fontSize: 15, color: Palette.textSecondary, marginBottom: Spacing.xxl },
  descriptionCard: { marginBottom: Spacing.lg },
  label: { ...Type.eyebrow, marginBottom: Spacing.sm },
  description: { fontSize: 14, color: Palette.text, lineHeight: 22 },
  detailsCard: { marginBottom: Spacing.xxl },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderLight,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 14, color: Palette.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: Palette.ink, textTransform: 'capitalize' },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
});