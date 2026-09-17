import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, SkeletonScreen, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchWard, WardPatient } from '@/lib/api';
import { roomStatus, ROOM_TONE_LABEL } from '@/lib/rooms';

/**
 * A room's census: who is in which bed. Reads the same cached /api/student/ward
 * payload the Clinic tab already pulled, so walking into a room costs nothing.
 * Empty beds are drawn as placeholder rows so the room reads the way it looks
 * on the floor plan.
 */
export default function RoomCensusScreen() {
  const { id } = useLocalSearchParams();
  const roomId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const { data, loading, refreshing, error, refresh } = useApiData(fetchWard);

  if (loading && !data) {
    return <SkeletonScreen />;
  }

  const room = data?.rooms.find((r) => r.id === roomId) ?? null;

  if (!room) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="alert-circle-outline" message={error ?? 'Room not found'} />
      </View>
    );
  }

  const occupants = (data?.patients ?? []).filter((p) => p.room_id === roomId);
  const tone = roomStatus(room.occupied, room.capacity);
  const toneAccent = tone === 'available' ? Accent.green : tone === 'crowded' ? Accent.amber : Accent.red;
  const emptyBeds = Math.max(0, room.capacity - occupants.length);

  const openPatient = (patient: WardPatient) => router.push(`/clinic/patient/${patient.id}`);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: toneAccent.bg }]}>
          <Ionicons name="bed" size={24} color={toneAccent.fg} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{room.name}</Text>
          <Text style={styles.subtitle}>
            Room {room.room_number} · {room.occupied}/{room.capacity} beds
          </Text>
        </View>
        <Badge
          label={room.status !== 'active' ? room.status : ROOM_TONE_LABEL[tone]}
          variant={
            room.status !== 'active'
              ? 'default'
              : tone === 'available'
                ? 'success'
                : tone === 'crowded'
                  ? 'warning'
                  : 'danger'
          }
        />
      </View>

      {occupants.length === 0 && emptyBeds === 0 ? (
        <EmptyState icon="bed-outline" message="This room has no beds set up yet." />
      ) : null}

      {occupants.map((patient) => (
        <Pressable
          key={patient.id}
          style={({ pressed }) => [styles.bedCard, patient.is_assigned && styles.bedCardMine, pressed && styles.pressed]}
          onPress={() => openPatient(patient)}
          accessibilityRole="button"
          accessibilityLabel={`${patient.name}${patient.is_assigned ? ', your assigned patient' : ', view only'}`}
        >
          <View
            style={[
              styles.bedAvatar,
              { backgroundColor: patient.is_assigned ? Palette.primary : Palette.borderLight },
            ]}
          >
            <Ionicons name="person" size={20} color={patient.is_assigned ? '#fff' : Palette.textMuted} />
          </View>
          <View style={styles.bedBody}>
            <Text style={styles.bedName} numberOfLines={1}>
              {patient.name}
            </Text>
            <Text style={styles.bedMeta} numberOfLines={1}>
              {patient.age !== null ? `${patient.age} yrs` : 'Age —'} · {patient.gender ?? '—'}
              {patient.is_assigned && patient.diagnosis ? ` · ${patient.diagnosis}` : ''}
            </Text>
          </View>
          {patient.is_assigned ? (
            <View style={[styles.minePill, { backgroundColor: Palette.primaryTint }]}>
              <View style={[styles.mineDot, { backgroundColor: Palette.primary }]} />
              <Text style={[styles.minePillText, { color: Palette.primary }]}>Yours</Text>
            </View>
          ) : (
            <Text style={styles.viewOnly}>View only</Text>
          )}
          <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
        </Pressable>
      ))}

      {Array.from({ length: emptyBeds }).map((_, index) => (
        <Card key={`empty-${index}`} style={styles.emptyBed}>
          <Ionicons name="bed-outline" size={18} color={Palette.textFaint} />
          <Text style={styles.emptyBedText}>Empty bed</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 32 },
    errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.xl,
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    title: Type.title,
    subtitle: { fontSize: 13, color: Palette.textSecondary, marginTop: 2 },
    bedCard: {
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
    bedCardMine: {
      borderColor: Palette.primary,
      borderWidth: 2,
    },
    bedAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bedBody: { flex: 1 },
    bedName: Type.itemTitle,
    bedMeta: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    minePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.pill,
    },
    minePillText: { fontSize: 11, fontWeight: '700' },
    mineDot: { width: 6, height: 6, borderRadius: 3 },
    viewOnly: { fontSize: 11, color: Palette.textMuted, fontWeight: '600' },
    emptyBed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm + 2,
      opacity: 0.6,
    },
    emptyBedText: { fontSize: 13, color: Palette.textMuted },
  });
}
