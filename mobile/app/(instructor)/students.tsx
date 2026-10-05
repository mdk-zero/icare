import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useApiData } from "@/hooks/useApiData";
import { Avatar, EmptyState, SkeletonRows, SyncStatus } from "@/components/ui";
import { fetchCourseProgress, fetchMyCourses, type CourseProgress } from "@/lib/api";
import { termStatus } from "@/lib/courses";

interface StudentRow {
  id: string;
  name: string;
  picture_url: string | null;
  group_label: string;
  done: number;
  total: number;
  courses: { code: string; done: number; total: number }[];
}

/** Everyone in the instructor's running courses, the furthest behind first. */
async function loadStudents() {
  const mine = await fetchMyCourses();
  const running = mine.data.offerings.filter((o) => termStatus(o.term) === "current" && o.student_count > 0);
  const results = await Promise.all(running.map((o) => fetchCourseProgress(o.id)));
  return {
    data: results.map((r) => r.data),
    fromCache: mine.fromCache || results.some((r) => r.fromCache),
    cachedAt: mine.cachedAt ?? results.find((r) => r.cachedAt)?.cachedAt ?? null,
  };
}

function merge(progress: CourseProgress[]): StudentRow[] {
  const byId = new Map<string, StudentRow>();
  for (const course of progress) {
    for (const s of course.students) {
      const row = byId.get(s.id) ?? {
        id: s.id,
        name: s.name,
        picture_url: s.picture_url,
        group_label: s.group_label,
        done: 0,
        total: 0,
        courses: [],
      };
      row.done += s.done;
      row.total += s.total;
      row.courses.push({ code: course.offering.course.code, done: s.done, total: s.total });
      byId.set(s.id, row);
    }
  }
  const ratio = (r: StudentRow) => (r.total === 0 ? 1 : r.done / r.total);
  return [...byId.values()].sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name));
}

export default function StudentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(loadStudents);
  const [query, setQuery] = useState("");

  const students = useMemo(() => merge(data ?? []), [data]);
  const shown = query.trim()
    ? students.filter((s) => `${s.name} ${s.group_label}`.toLowerCase().includes(query.trim().toLowerCase()))
    : students;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />}
    >
      <Text style={Type.screenTitle}>Students</Text>
      <Text style={styles.subtitle}>This term&apos;s requirements across your courses, the furthest behind first.</Text>
      <SyncStatus onSynced={reload} />

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={Palette.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or group"
          placeholderTextColor={Palette.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <SkeletonRows rows={7} leadSize={32} />
      ) : error && !data ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : students.length === 0 ? (
        <EmptyState icon="people-outline" message="No students in this term's courses yet." />
      ) : shown.length === 0 ? (
        <EmptyState icon="search-outline" message="No student matches that search." />
      ) : (
        <View style={styles.list}>
          {shown.map((s, i) => {
            const complete = s.total > 0 && s.done === s.total;
            const tone = complete ? Accent.green : s.done === 0 ? Accent.red : Accent.amber;
            return (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: "/student/[id]", params: { id: s.id, name: s.name } })}
                accessibilityRole="button"
                accessibilityLabel={`${s.name}, ${s.done} of ${s.total} requirements met`}
                style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.7 }]}
              >
                <Avatar name={s.name} size="sm" imageUrl={s.picture_url?.startsWith("http") ? s.picture_url : null} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {s.group_label} · {s.courses.map((c) => `${c.code} ${c.done}/${c.total}`).join(", ")}
                  </Text>
                </View>
                <View style={[styles.count, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.countText, { color: tone.fg }]}>
                    {s.done}/{s.total}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"], Shadow: ReturnType<typeof useTheme>["Shadow"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 128 },
    subtitle: { fontSize: 14, color: Palette.textSecondary, marginTop: 4, marginBottom: Spacing.lg },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      backgroundColor: Palette.surface,
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Palette.ink },
    list: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    row: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: Palette.borderLight },
    name: { fontSize: 15, fontWeight: "600", color: Palette.ink },
    meta: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    count: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    countText: { fontSize: 13, fontWeight: "700" },
  });
}
