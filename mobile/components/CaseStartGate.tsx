import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const STEPS = [
  'Wait until your instructor is with you and ready to watch.',
  'Tap Start. The timer begins and your tasks appear.',
  'Do each task in order. Your instructor grades each one as you do it.',
  'The timer stops once every task has been graded.',
];

/**
 * What a patient case opens on before it starts: what it is and a few
 * plain instructions. The tasks and the timer only appear after Start, so
 * nothing runs while the student is still reading or waiting.
 */
export function CaseStartGate({
  title,
  patientName,
  room,
  deadline,
  taskCount,
  starting,
  onStart,
}: {
  title: string;
  patientName?: string | null;
  room?: string | null;
  deadline?: string | null;
  taskCount: number;
  starting: boolean;
  onStart: () => void;
}) {
  const router = useRouter();
  const { Palette, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Type), [Palette, Type]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.icon}>
        <Ionicons name="clipboard-outline" size={28} color={Palette.primary} />
      </View>
      <Text style={styles.kicker}>Before you start</Text>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.meta}>
        {patientName ? (
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={14} color={Palette.textSecondary} />
            <Text style={styles.metaText}>
              {patientName}
              {room ? ` · ${room}` : ''}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="list-outline" size={14} color={Palette.textSecondary} />
          <Text style={styles.metaText}>
            {taskCount} task{taskCount === 1 ? '' : 's'} to demonstrate
          </Text>
        </View>
        {deadline ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={Palette.textSecondary} />
            <Text style={styles.metaText}>Due {new Date(deadline).toLocaleString()}</Text>
          </View>
        ) : null}
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>What to do</Text>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNo}>
              <Text style={styles.stepNoText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <PrimaryButton title="Start" size="lg" onPress={onStart} loading={starting} style={styles.start} />
      <PrimaryButton title="Not yet" variant="outline" onPress={() => router.back()} disabled={starting} />
    </ScrollView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Type: ReturnType<typeof useTheme>['Type']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.xl, paddingBottom: Spacing.xl * 2 },
    icon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Palette.surfaceMuted,
      marginBottom: Spacing.lg,
    },
    kicker: { ...Type.caption, textTransform: 'uppercase', letterSpacing: 1, color: Palette.primary, fontWeight: '700' },
    title: { fontSize: 22, fontWeight: '700', color: Palette.ink, marginTop: 4 },
    meta: { marginTop: Spacing.md, gap: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaText: { fontSize: 14, color: Palette.textSecondary, flexShrink: 1 },
    card: { marginTop: Spacing.xl, padding: Spacing.lg, gap: Spacing.md },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    stepNo: {
      width: 24,
      height: 24,
      borderRadius: Radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Palette.primary,
    },
    stepNoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: Palette.ink },
    start: { marginTop: Spacing.xl, marginBottom: Spacing.md },
  });
}
