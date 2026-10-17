import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, SkeletonBlock, EmptyState, Badge } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchScenarioAssignments, isReturnDemo, type ScenarioAssignment } from '@/lib/api';
import { returnDemoStatus } from '@/lib/return-demos';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** "Mon, Oct 20": a demonstration is performed on a day. */
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * The student's Return Demonstrations: the Taylor's skills they'll perform
 * for their instructor. Unlike a patient case, each opens to its skills'
 * checklists, so they can prepare step by step before the day.
 */
export default function ReturnDemosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchScenarioAssignments);

  // A grade or a new assignment shows when the tab is opened again.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  const demos = (data ?? []).filter(isReturnDemo);
  // Still to perform, soonest first; then graded ones, newest first.
  const upcoming = demos
    .filter((d) => d.status !== 'completed')
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  const graded = demos
    .filter((d) => d.status === 'completed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  const card = (d: ScenarioAssignment) => {
    const status = returnDemoStatus(d);
    return (
      <Pressable
        key={d.id}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => router.push(`/retdem/${d.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${d.scenario_title}, ${status.label}`}
      >
        <View style={[styles.icon, { backgroundColor: Accent.teal.bg }]}>
          <Ionicons name="hand-left-outline" size={18} color={Accent.teal.fg} />
        </View>
        <View style={styles.body}>
          <Text style={Type.itemTitle} numberOfLines={2}>
            {d.scenario_title}
          </Text>
          <View style={styles.meta}>
            <Badge label={status.label} variant={status.variant} size="sm" />
            {d.deadline && d.status !== 'completed' ? (
              <Text style={Type.caption}>Perform on {dayLabel(d.deadline)}</Text>
            ) : null}
          </View>
          {d.status !== 'completed' ? <Text style={styles.hint}>Open to see the checklist</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <ScreenHeader
        title="Return Demos"
        subtitle={
          demos.length
            ? `${upcoming.length} to perform · ${graded.length} graded`
            : 'Skills you demonstrate to your instructor'
        }
        icon="hand-left-outline"
        accent="teal"
      />

      {loading && !data ? (
        [0, 1, 2].map((i) => (
          <View key={i} style={styles.card}>
            <View style={styles.body}>
              <SkeletonBlock width="70%" height={14} />
              <SkeletonBlock width="40%" height={11} style={{ marginTop: Spacing.sm }} />
            </View>
          </View>
        ))
      ) : demos.length === 0 ? (
        <EmptyState
          icon="hand-left-outline"
          message={error ?? 'No Return Demonstrations yet. When your instructor assigns one, it shows here.'}
        />
      ) : (
        <>
          {upcoming.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>To perform</Text>
              {upcoming.map(card)}
            </View>
          ) : null}
          {graded.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Graded</Text>
              {graded.map(card)}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 128 },
    section: { marginTop: Spacing.lg },
    sectionTitle: { ...Type.eyebrow, marginBottom: Spacing.sm },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderRadius: Radius.lg,
      backgroundColor: Palette.surface,
      borderWidth: 1,
      borderColor: Palette.borderLight,
      ...Shadow.card,
    },
    pressed: { opacity: 0.85 },
    icon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, minWidth: 0 },
    meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginTop: 6 },
    hint: { fontSize: 12, color: Palette.textMuted, marginTop: 4 },
  });
}
