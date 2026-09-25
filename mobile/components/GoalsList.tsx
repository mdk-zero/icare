import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { fetchGoals, setGoalStatus, type StudentGoal } from '@/lib/api';

/**
 * The goals the student set when reflecting on graded work, open first. Tap
 * one to mark it met, or again to reopen it.
 */
export function GoalsList() {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [goals, setGoals] = useState<StudentGoal[] | null>(null);

  const load = useCallback(() => {
    fetchGoals()
      .then(setGoals)
      .catch(() => setGoals([]));
  }, []);
  useEffect(load, [load]);

  const toggle = async (goal: StudentGoal) => {
    const next = goal.status === 'met' ? 'open' : 'met';
    setGoals((prev) => prev?.map((g) => (g.id === goal.id ? { ...g, status: next } : g)) ?? prev);
    try {
      await setGoalStatus(goal.id, next);
    } catch {
      setGoals((prev) => prev?.map((g) => (g.id === goal.id ? goal : g)) ?? prev);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="My Goals" />
      <View style={styles.listCard}>
        {goals !== null && goals.length === 0 && (
          <Text style={styles.empty}>Set goals when you reflect on a graded scenario or skill assessment.</Text>
        )}
        {(goals ?? []).slice(0, 8).map((g, i) => (
          <Pressable
            key={g.id}
            onPress={() => toggle(g)}
            style={[styles.row, i > 0 && styles.divider]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: g.status === 'met' }}
          >
            <Ionicons
              name={g.status === 'met' ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={g.status === 'met' ? Accent.green.fg : Palette.textMuted}
            />
            <Text style={[styles.text, g.status === 'met' && styles.done]}>{g.text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    section: { marginBottom: Spacing.xl },
    listCard: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      paddingHorizontal: Spacing.md,
    },
    empty: { fontSize: 13, color: Palette.textSecondary, paddingVertical: Spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.borderLight },
    text: { flex: 1, fontSize: 14, color: Palette.text },
    done: { color: Palette.textMuted, textDecorationLine: 'line-through' },
  });
}
