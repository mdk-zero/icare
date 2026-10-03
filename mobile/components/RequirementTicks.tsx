import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { setRequirementCheck, type CourseRequirement, type ItemProgress } from '@/lib/api';
import { canAct, optimisticItem } from '@/lib/courses';

/** A tick, "3/5", a band, or an empty ring: one student's standing on one item. */
export function StatusDot({ requirement, item }: { requirement: CourseRequirement; item: ItemProgress | undefined }) {
  const { Accent, Palette } = useTheme();
  if (item?.done) {
    const byYou = item.source === 'instructor';
    const tone = byYou ? Accent.violet : Accent.green;
    return (
      <View style={[styles.dot, { backgroundColor: tone.bg }]}>
        <Ionicons name={byYou ? 'person' : 'checkmark'} size={14} color={tone.fg} />
      </View>
    );
  }
  if (requirement.kind === 'count' && item && item.current > 0) {
    return (
      <View style={[styles.dot, styles.pill, { backgroundColor: Accent.amber.bg }]}>
        <Text style={[styles.pillText, { color: Accent.amber.fg }]}>
          {item.current}/{item.target}
        </Text>
      </View>
    );
  }
  return <View style={[styles.dot, styles.ring, { borderColor: Palette.border }]} />;
}

type Pending = {
  offeringId: string;
  studentId: string;
  studentName: string;
  requirement: CourseRequirement;
  item: ItemProgress | undefined;
};

/**
 * Ticking from the instructor screens. A manual item toggles at once; an
 * automatic one asks for a note before it is marked done, and for a
 * confirmation before the mark is removed. The change shows straight away
 * and, offline, waits in the outbox.
 */
export function useRequirementTicks(onChange: (studentId: string, requirementId: string, item: ItemProgress) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (p: Pending, checked: boolean, note = '') => {
    const key = `${p.studentId}:${p.requirement.id}`;
    const before = p.item;
    onChange(p.studentId, p.requirement.id, optimisticItem(before, checked, note));
    setBusy(key);
    try {
      const result = await setRequirementCheck(p.offeringId, p.requirement.id, {
        student_id: p.studentId,
        checked,
        ...(note ? { note } : {}),
      });
      if (result.progress) onChange(p.studentId, p.requirement.id, result.progress);
      return true;
    } catch (err) {
      if (before) onChange(p.studentId, p.requirement.id, before);
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const act = (p: Pending) => {
    if (!canAct(p.requirement, p.item)) return;
    if (p.requirement.kind === 'manual') void send(p, !p.item?.done);
    else if (p.item?.done) {
      Alert.alert('Remove your mark?', `${p.studentName}: the item goes back to counting graded work only.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void send(p, false) },
      ]);
    } else setPending(p);
  };

  const sheet = (
    <MarkDoneSheet
      pending={pending}
      onClose={() => setPending(null)}
      onSubmit={async (note) => {
        if (pending && (await send(pending, true, note))) setPending(null);
      }}
      saving={busy !== null}
    />
  );

  return { act, busy, sheet };
}

function MarkDoneSheet({
  pending,
  onClose,
  onSubmit,
  saving,
}: {
  pending: Pending | null;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
  saving: boolean;
}) {
  const { Palette, Type } = useTheme();
  const [note, setNote] = useState('');
  const sheetStyles = useMemo(() => createSheetStyles(Palette), [Palette]);

  return (
    <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={onClose} onShow={() => setNote('')}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
        <View style={sheetStyles.sheet}>
          <Text style={[Type.sectionTitle, { color: Palette.ink }]}>Mark as done</Text>
          <Text style={sheetStyles.subtitle}>{pending?.studentName}</Text>
          <Text style={sheetStyles.item}>{pending?.requirement.title || pending?.requirement.label}</Text>
          <Text style={sheetStyles.hint}>
            This item normally ticks itself from graded work. Mark it done when the student met it some other way, such as a
            Quiz taken on paper.
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why it is done"
            placeholderTextColor={Palette.textMuted}
            multiline
            maxLength={500}
            autoFocus
            editable={!saving}
            style={sheetStyles.input}
          />
          <View style={sheetStyles.actions}>
            <Pressable onPress={onClose} disabled={saving} style={({ pressed }) => [sheetStyles.button, pressed && { opacity: 0.7 }]}>
              <Text style={sheetStyles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSubmit(note.trim())}
              disabled={saving || !note.trim()}
              style={({ pressed }) => [
                sheetStyles.button,
                sheetStyles.primary,
                (saving || !note.trim()) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sheetStyles.primaryText}>Mark done</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: undefined,
    minWidth: 28,
    paddingHorizontal: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ring: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});

function createSheetStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: Palette.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding: Spacing.xl,
      paddingBottom: Spacing.xxl + 12,
      gap: Spacing.sm,
    },
    subtitle: { fontSize: 13, color: Palette.textSecondary },
    item: { fontSize: 15, fontWeight: '600', color: Palette.ink, marginTop: Spacing.sm },
    hint: { fontSize: 13, color: Palette.textSecondary, lineHeight: 19 },
    input: {
      minHeight: 88,
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      padding: Spacing.md,
      fontSize: 15,
      color: Palette.ink,
      textAlignVertical: 'top',
      marginTop: Spacing.sm,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.md },
    button: {
      paddingVertical: 11,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 96,
    },
    cancel: { fontSize: 15, fontWeight: '600', color: Palette.textSecondary },
    primary: { backgroundColor: Palette.primary },
    primaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
