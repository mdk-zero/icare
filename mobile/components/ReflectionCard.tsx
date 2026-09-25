import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchReflection,
  requestReflectionFeedback,
  saveReflection,
  type ReflectionFeedback,
  type ReflectionSource,
  type ReflectionState,
} from '@/lib/api';

const MAX_GOALS = 3;

/**
 * After a scenario is finalized or a skill assessment is scored: the grade on
 * each Taylor's skill, feedback on strengths and what to improve (fetched only
 * when the student asks), and their reflection with up to three goals.
 * Mirrors web/app/components/ReflectionPanel.tsx.
 */
export function ReflectionCard({ source, sourceId }: { source: ReflectionSource; sourceId: string }) {
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [state, setState] = useState<ReflectionState | null>(null);
  const [feedback, setFeedback] = useState<ReflectionFeedback | null>(null);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    let live = true;
    fetchReflection(source, sourceId)
      .then((loaded) => {
        if (!live) return;
        setState(loaded);
        setFeedback(loaded.feedback_stale ? null : loaded.feedback);
        setText(loaded.reflection?.text ?? '');
        setGoals(loaded.goals.map((g) => g.text));
        setEditing(!loaded.reflection);
      })
      .catch(() => live && setState(null));
    return () => {
      live = false;
    };
  }, [source, sourceId]);

  if (!state) return null;

  const levelColor = (level: string) =>
    level === 'Excellent' ? Accent.green : level === 'Satisfactory' ? Accent.blue : Accent.amber;

  const ask = async () => {
    setAsking(true);
    try {
      setFeedback(await requestReflectionFeedback(source, sourceId));
    } catch (err) {
      Alert.alert('Feedback unavailable', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setAsking(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveReflection(
        source,
        sourceId,
        text,
        goals.map((g) => g.trim()).filter(Boolean).map((g) => ({ text: g, skill_id: null })),
      );
      setEditing(false);
    } catch (err) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const addGoal = (goal = '') => setGoals((prev) => (prev.length >= MAX_GOALS ? prev : [...prev, goal]));

  return (
    <Card style={styles.card}>
      <Text style={Type.eyebrow}>Reflect on your results</Text>

      {state.work.items.map((item) => {
        const tone = levelColor(item.level);
        return (
          <View key={item.title} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.remarks ? <Text style={styles.remark}>Instructor: “{item.remarks}”</Text> : null}
            </View>
            <View style={[styles.levelPill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.levelText, { color: tone.fg }]}>{item.level}</Text>
            </View>
          </View>
        );
      })}

      {feedback ? (
        <View style={styles.feedback}>
          <Text style={styles.body}>{feedback.summary}</Text>
          {feedback.strengths.length > 0 && <Text style={[styles.label, { color: Accent.green.fg }]}>Strengths</Text>}
          {feedback.strengths.map((s, i) => (
            <Text key={`s${i}`} style={styles.bullet}>• {s.note}</Text>
          ))}
          {feedback.improvements.length > 0 && <Text style={[styles.label, { color: Accent.amber.fg }]}>To improve</Text>}
          {feedback.improvements.map((s, i) => (
            <Text key={`i${i}`} style={styles.bullet}>• {s.note}</Text>
          ))}
          {editing &&
            goals.length < MAX_GOALS &&
            feedback.suggested_goals
              .filter((g) => !goals.includes(g))
              .map((g) => (
                <Pressable key={g} onPress={() => addGoal(g)} style={styles.suggestion}>
                  <Ionicons name="add" size={14} color={Palette.primary} />
                  <Text style={styles.suggestionText}>{g}</Text>
                </Pressable>
              ))}
        </View>
      ) : (
        <PrimaryButton
          title={asking ? 'Reading your results…' : state.feedback_stale ? 'Refresh feedback' : 'Get feedback'}
          onPress={ask}
          variant="outline"
          disabled={asking}
        />
      )}

      {!state.enabled ? null : editing ? (
        <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
          <Text style={styles.label}>Your reflection</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={4000}
            placeholder="What went well? What would you do differently next time?"
            placeholderTextColor={Palette.textMuted}
            style={[styles.input, { minHeight: 90 }]}
          />
          <Text style={styles.label}>Goals (up to {MAX_GOALS})</Text>
          {goals.map((g, i) => (
            <View key={i} style={styles.goalRow}>
              <TextInput
                value={g}
                onChangeText={(v) => setGoals((prev) => prev.map((x, j) => (j === i ? v : x)))}
                maxLength={300}
                placeholder="e.g. Count every irregular pulse for a full minute"
                placeholderTextColor={Palette.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={() => setGoals((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                <Ionicons name="close" size={18} color={Palette.textMuted} />
              </Pressable>
            </View>
          ))}
          {goals.length < MAX_GOALS && (
            <Pressable onPress={() => addGoal()} style={styles.addGoal}>
              <Ionicons name="add-circle-outline" size={16} color={Palette.primary} />
              <Text style={styles.suggestionText}>Add a goal</Text>
            </Pressable>
          )}
          <PrimaryButton
            title={saving ? 'Saving…' : 'Save reflection'}
            onPress={save}
            disabled={saving || (!text.trim() && !goals.some((g) => g.trim()))}
          />
        </View>
      ) : (
        <View style={{ gap: Spacing.xs, marginTop: Spacing.md }}>
          {text ? <Text style={styles.body}>{text}</Text> : null}
          {goals.map((g, i) => (
            <View key={i} style={styles.goalRow}>
              <Ionicons name="flag-outline" size={14} color={Palette.primary} />
              <Text style={[styles.body, { flex: 1 }]}>{g}</Text>
            </View>
          ))}
          <Pressable onPress={() => setEditing(true)} style={styles.addGoal}>
            <Ionicons name="create-outline" size={16} color={Palette.primary} />
            <Text style={styles.suggestionText}>Edit reflection</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    card: { marginBottom: Spacing.lg, gap: Spacing.sm },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Palette.borderLight,
    },
    itemTitle: { fontSize: 13, color: Palette.text },
    remark: { fontSize: 12, fontStyle: 'italic', color: Palette.textSecondary, marginTop: 2 },
    levelPill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
    levelText: { fontSize: 11, fontWeight: '700' },
    feedback: { backgroundColor: Palette.primaryTint, borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
    body: { fontSize: 14, color: Palette.text, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: '700', color: Palette.ink, marginTop: Spacing.xs },
    bullet: { fontSize: 13, color: Palette.text, lineHeight: 19 },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: Palette.primary,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      marginTop: 4,
      alignSelf: 'flex-start',
    },
    suggestionText: { fontSize: 12, color: Palette.primary, fontWeight: '600', flexShrink: 1 },
    input: {
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: 14,
      color: Palette.ink,
      backgroundColor: Palette.surface,
      textAlignVertical: 'top',
    },
    goalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    addGoal: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  });
}
