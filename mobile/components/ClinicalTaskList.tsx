import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ScenarioTask } from '@/lib/api';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { TASK_RATING_LABEL, type TaskRating } from '@/lib/task-ratings';

/**
 * A scenario's clinical tasks as a numbered list. It is not a checklist the
 * student works through: the instructor watches the demonstration and grades
 * each task, so the only thing on the right is that grade, as the share of the
 * task's points earned — a dash until the instructor's saved grade is
 * released, when the task's title is struck through.
 */
export function ClinicalTaskList({ tasks }: { tasks: ScenarioTask[] }) {
  const { Palette, Accent, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Type), [Palette, Type]);

  const gradeAccent: Record<TaskRating, { fg: string; bg: string }> = {
    excellent: Accent.green,
    satisfactory: Accent.blue,
    needs_practice: Accent.amber,
  };

  return (
    <View>
      {tasks.map((task, idx) => {
        const rating = task.rating && TASK_RATING_LABEL[task.rating] ? task.rating : null;
        const accent = rating ? gradeAccent[rating] : null;
        return (
          <View key={task.id} style={[styles.row, idx === tasks.length - 1 && styles.rowLast]}>
            <Text style={styles.number}>{String(idx + 1).padStart(2, '0')}</Text>
            <View style={styles.body}>
              {/* Struck through once graded, so what is left to demonstrate stands out. */}
              <Text style={[styles.title, rating && styles.titleGraded]}>{task.title}</Text>
              {task.description ? <Text style={styles.description}>{task.description}</Text> : null}
              {task.remarks ? <Text style={styles.remarks}>{task.remarks}</Text> : null}
            </View>
            {accent && rating ? (
              <Text
                style={[styles.grade, { color: accent.fg, backgroundColor: accent.bg }]}
                accessibilityLabel={`Graded ${task.percent != null ? `${task.percent}%` : TASK_RATING_LABEL[rating]}`}
              >
                {task.percent != null ? `${task.percent}%` : TASK_RATING_LABEL[rating]}
              </Text>
            ) : (
              <Text style={styles.ungraded} accessibilityLabel="Not graded yet">
                —
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** The numbered rows while a case's tasks load. */
export function ClinicalTaskListSkeleton({ rows = 4 }: { rows?: number }) {
  const { Palette, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Type), [Palette, Type]);
  const widths = ['80%', '65%', '75%', '60%', '70%'] as const;
  return (
    <View accessibilityLabel="Loading tasks">
      {Array.from({ length: rows }).map((_, idx) => (
        <View key={idx} style={[styles.row, idx === rows - 1 && styles.rowLast]}>
          <Text style={styles.number}>{String(idx + 1).padStart(2, '0')}</Text>
          <View style={styles.body}>
            <SkeletonBlock width={widths[idx % widths.length]} height={14} />
            <SkeletonBlock width="45%" height={11} style={{ marginTop: 6 }} />
          </View>
          <Text style={styles.ungraded}>—</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Palette.borderLight,
    },
    rowLast: { borderBottomWidth: 0 },
    number: {
      width: 22,
      fontSize: 12,
      fontWeight: '800',
      color: Palette.textMuted,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    body: { flex: 1 },
    title: { ...Type.itemTitle },
    titleGraded: { textDecorationLine: 'line-through', color: Palette.textMuted },
    description: { fontSize: 12, color: Palette.textSecondary, marginTop: 2, lineHeight: 17 },
    remarks: {
      fontSize: 12,
      color: Palette.text,
      lineHeight: 17,
      marginTop: 6,
      padding: Spacing.sm,
      borderRadius: Radius.sm,
      backgroundColor: Palette.borderLight,
    },
    grade: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.pill,
      overflow: 'hidden',
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
    ungraded: {
      minWidth: 24,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      color: Palette.textMuted,
    },
  });
}
