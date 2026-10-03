import React, { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApiData } from "@/hooks/useApiData";
import { EmptyState, SkeletonList, SyncStatus } from "@/components/ui";
import { fetchMyCourses, type InstructorCourse, type TermStatus } from "@/lib/api";
import { TERM_STATUS_LABEL, termStatus } from "@/lib/courses";

const ORDER: Record<TermStatus, number> = { current: 0, upcoming: 1, ended: 2 };

/** The courses a Dean assigned the instructor, the running term first. */
export default function CoursesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(fetchMyCourses);

  const groups = useMemo(() => {
    const offerings = data?.offerings ?? [];
    const terms = [...new Map(offerings.map((o) => [o.term.id, o.term])).values()].sort(
      (a, b) => ORDER[termStatus(a)] - ORDER[termStatus(b)] || b.starts_on.localeCompare(a.starts_on),
    );
    return terms.map((term) => ({ term, status: termStatus(term), offerings: offerings.filter((o) => o.term.id === term.id) }));
  }, [data]);

  const statusTone = { current: Accent.green, upcoming: Accent.blue, ended: Accent.slate };
  const firstName = user?.name?.split(/\s+/)[0] ?? "";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />}
    >
      <Text style={Type.screenTitle}>Courses</Text>
      <Text style={styles.subtitle}>
        {firstName ? `Hi ${firstName}. ` : ""}What your students must accomplish this term, course by course.
      </Text>
      <SyncStatus onSynced={reload} />

      {loading ? (
        <SkeletonList />
      ) : error && !data ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : groups.length === 0 ? (
        <EmptyState icon="book-outline" message="No courses yet. Your Dean assigns them on the web portal." />
      ) : (
        groups.map(({ term, status, offerings }) => (
          <View key={term.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={Type.sectionTitle}>{term.name}</Text>
              <View style={[styles.badge, { backgroundColor: statusTone[status].bg }]}>
                <Text style={[styles.badgeText, { color: statusTone[status].fg }]}>{TERM_STATUS_LABEL[status]}</Text>
              </View>
            </View>
            {offerings.map((o) => (
              <CourseCard key={o.id} offering={o} styles={styles} onPress={() => router.push(`/course/${o.id}`)} />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function CourseCard({
  offering: o,
  styles,
  onPress,
}: {
  offering: InstructorCourse;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const { Palette, Accent } = useTheme();
  const noGroup = o.sections.filter((s) => !s.has_group);
  const share = o.progress && o.progress.students > 0 ? o.progress.complete / o.progress.students : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${o.course.code} ${o.course.title}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{o.course.code}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {o.course.title}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Palette.textFaint} />
      </View>
      <View style={styles.chips}>
        {o.sections.map((s) => (
          <View key={s.id} style={[styles.chip, { backgroundColor: s.has_group ? Accent.teal.bg : Accent.amber.bg }]}>
            <Text style={[styles.chipText, { color: s.has_group ? Accent.teal.fg : Accent.amber.fg }]}>{s.name}</Text>
          </View>
        ))}
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {o.student_count} student{o.student_count === 1 ? "" : "s"}
        </Text>
        <Text style={styles.metaText}>·</Text>
        <Text style={styles.metaText}>
          {o.requirement_count === 0 ? "No checklist yet" : `${o.requirement_count} requirement${o.requirement_count === 1 ? "" : "s"}`}
        </Text>
      </View>
      {o.progress && (
        <View style={{ marginTop: Spacing.md }}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.metaText}>Met every requirement</Text>
            <Text style={styles.progressValue}>
              {o.progress.complete} of {o.progress.students}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${share * 100}%` }]} />
          </View>
        </View>
      )}
      {noGroup.length > 0 && (
        <Text style={[styles.warning, { color: Accent.amber.fg }]}>
          You have no group in {noGroup.map((s) => s.name).join(", ")}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"], Shadow: ReturnType<typeof useTheme>["Shadow"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 128 },
    subtitle: { fontSize: 14, color: Palette.textSecondary, marginTop: 4, marginBottom: Spacing.lg },
    group: { marginBottom: Spacing.xl },
    groupHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md },
    badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 11, fontWeight: "700" },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      ...Shadow.card,
    },
    cardTop: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
    code: { fontSize: 18, fontWeight: "800", color: Palette.ink },
    title: { fontSize: 14, color: Palette.textSecondary, marginTop: 2 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.md },
    chip: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontSize: 12, fontWeight: "600" },
    meta: { flexDirection: "row", gap: 6, marginTop: Spacing.md },
    metaText: { fontSize: 13, color: Palette.textSecondary },
    progressLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    progressValue: { fontSize: 13, fontWeight: "700", color: Palette.ink },
    track: { height: 6, borderRadius: 3, backgroundColor: Palette.borderLight, overflow: "hidden" },
    fill: { height: 6, borderRadius: 3, backgroundColor: Palette.primary },
    warning: { fontSize: 12, marginTop: Spacing.sm },
  });
}
