import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, SkeletonBlock, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchWard, type RoomActivity } from '@/lib/api';
import { openCase } from '@/lib/open-case';
import { performOn } from '@/lib/return-demos';
import { timeLimitLabel } from '@/lib/time-limit';

/**
 * A room (098): what the student performs in it, their patient cases and
 * Return Demonstrations, soonest first. Rooms are only where the work happens,
 * so there is no census. Reads the same cached /api/student/ward payload the
 * Clinic tab already pulled, so walking into a room costs nothing.
 */
export default function RoomScreen() {
  const { id } = useLocalSearchParams();
  const roomId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);

  const { data, loading, refreshing, error, refresh } = useApiData(fetchWard);

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading the room">
        <View style={styles.header}>
          <SkeletonBlock width={48} height={48} radius={Radius.md} />
          <View style={styles.headerText}>
            <SkeletonBlock width="60%" height={20} />
            <SkeletonBlock width="45%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={styles.card}>
            <SkeletonBlock width={40} height={40} radius={Radius.md} />
            <View style={styles.cardBody}>
              <SkeletonBlock width={['60%', '50%'][i] as `${number}%`} height={15} />
              <SkeletonBlock width="40%" height={11} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  const room = data?.rooms.find((r) => r.id === roomId) ?? null;
  if (!room) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Room not found'} />
      </View>
    );
  }

  // Unfinished first, soonest first; graded ones after.
  const activities = (data?.activities ?? [])
    .filter((a) => a.room_id === roomId)
    .sort(
      (a, b) =>
        Number(a.status === 'completed') - Number(b.status === 'completed') ||
        (a.deadline ?? '~').localeCompare(b.deadline ?? '~'),
    );

  const open = (a: RoomActivity) => {
    if (a.kind === 'return_demo') router.push(`/retdem/${a.id}`);
    else
      openCase(router, {
        id: a.id,
        patient_id: null,
        scenario_title: a.scenario_title,
        deadline: a.deadline,
        status: a.status,
        started_at: a.started_at,
      });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: Palette.primaryTint }]}>
          <Ionicons name="location" size={24} color={Palette.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{room.name}</Text>
          <Text style={styles.subtitle}>Room {room.room_number}</Text>
        </View>
        {room.status !== 'active' ? <Badge label={room.status} variant="default" /> : null}
      </View>

      {activities.length === 0 ? (
        <EmptyState icon="calendar-clear-outline" message="You have nothing to perform in this room." />
      ) : null}

      {activities.map((a) => {
        const demo = a.kind === 'return_demo';
        const done = a.status === 'completed';
        const tone = demo ? Accent.amber : Accent.teal;
        return (
          <Pressable
            key={a.id}
            style={({ pressed }) => [styles.card, done && styles.cardDone, pressed && styles.pressed]}
            onPress={() => open(a)}
            accessibilityRole="button"
            accessibilityLabel={`${demo ? 'Return Demonstration' : 'Patient case'}: ${a.scenario_title}${done ? ', graded' : ''}`}
          >
            <View style={[styles.cardIcon, { backgroundColor: tone.bg }]}>
              <Ionicons name={demo ? 'hand-left-outline' : 'pulse'} size={18} color={tone.fg} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.kicker}>{demo ? 'Return Demonstration' : 'Patient case'}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {a.scenario_title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {[
                  a.patient_name,
                  a.deadline ? performOn(a.deadline) : null,
                  a.time_limit_minutes ? timeLimitLabel(a.time_limit_minutes) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {done ? <Badge label="Graded" variant="success" /> : null}
            <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
          </Pressable>
        );
      })}
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
    content: { padding: Spacing.lg, paddingBottom: 32 },
    errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
    headerIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    headerText: { flex: 1 },
    title: Type.title,
    subtitle: { fontSize: 13, color: Palette.textSecondary, marginTop: 2 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.sm + 2,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    cardDone: { opacity: 0.75 },
    cardIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1 },
    kicker: { fontSize: 11, fontWeight: '700', color: Palette.textSecondary, letterSpacing: 0.4 },
    cardTitle: { ...Type.itemTitle, marginTop: 1 },
    cardMeta: { fontSize: 12, color: Palette.textSecondary, marginTop: 3 },
  });
}
