import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useApiData } from "@/hooks/useApiData";
import { EmptyState, SkeletonList, SyncStatus } from "@/components/ui";
import { StatusDot, useRequirementTicks } from "@/components/RequirementTicks";
import { fetchStudentRequirements, type ItemProgress } from "@/lib/api";
import { TERM_STATUS_LABEL, canAct, statusText } from "@/lib/courses";

/** One student's requirements in each of the instructor's courses, with ticking. */
export default function StudentRequirementsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(() => fetchStudentRequirements(id));
  const [overrides, setOverrides] = useState<Record<string, ItemProgress>>({});
  const studentName = name ?? "Student";

  const { act, busy, sheet } = useRequirementTicks((_student, requirementId, item) =>
    setOverrides((prev) => ({ ...prev, [requirementId]: item })),
  );

  const onRefresh = () => {
    setOverrides({});
    refresh();
  };

  return (
    <>
      <Stack.Screen options={{ title: studentName }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Palette.primary]} tintColor={Palette.primary} />}
      >
        <SyncStatus onSynced={reload} />
        {loading ? (
          <SkeletonList />
        ) : !data ? (
          <EmptyState icon="cloud-offline-outline" message={error ?? "Could not load this student's requirements."} />
        ) : data.courses.length === 0 ? (
          <EmptyState icon="book-outline" message="None of your courses cover this student's section yet." />
        ) : (
          data.courses.map((c) => {
            const itemFor = (requirementId: string) => overrides[requirementId] ?? c.progress[requirementId];
            const done = c.requirements.filter((r) => itemFor(r.id)?.done).length;
            const complete = c.requirements.length > 0 && done === c.requirements.length;
            return (
              <View key={c.offering.id} style={{ marginBottom: Spacing.xl }}>
                <View style={styles.courseHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={Type.sectionTitle}>
                      {c.offering.course.code} · {c.offering.course.title}
                    </Text>
                    <Text style={styles.detail}>
                      {c.offering.term.name} · {TERM_STATUS_LABEL[c.offering.status]}
                    </Text>
                  </View>
                  <View style={[styles.count, { backgroundColor: complete ? Accent.green.bg : Palette.surfaceMuted }]}>
                    <Text style={[styles.countText, { color: complete ? Accent.green.fg : Palette.textSecondary }]}>
                      {done}/{c.requirements.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.card}>
                  {c.requirements.length === 0 ? (
                    <Text style={[styles.detail, { padding: Spacing.md }]}>This course has no requirements yet.</Text>
                  ) : (
                    c.requirements.map((r, i) => {
                      const item = itemFor(r.id);
                      const key = `${id}:${r.id}`;
                      const tick = () => act({ offeringId: c.offering.id, studentId: id, studentName, requirement: r, item });
                      return (
                        <View key={r.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                          <StatusDot requirement={r} item={item} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{r.title || r.label}</Text>
                            <Text style={styles.detail}>
                              {r.title && r.kind !== "manual" ? `${r.label} · ` : ""}
                              {statusText(r, item)}
                            </Text>
                          </View>
                          {r.kind === "manual" ? (
                            <Switch
                              value={Boolean(item?.done)}
                              onValueChange={tick}
                              disabled={busy === key}
                              trackColor={{ true: Palette.primary, false: Palette.border }}
                              accessibilityLabel={r.title}
                            />
                          ) : canAct(r, item) ? (
                            <Pressable onPress={tick} disabled={busy === key} hitSlop={6} style={styles.markButton}>
                              <Text style={[styles.markText, { color: item?.done ? Accent.red.fg : Palette.primary }]}>
                                {item?.done ? "Unmark" : "Mark done"}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {sheet}
    </>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>["Palette"], Shadow: ReturnType<typeof useTheme>["Shadow"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 48 },
    courseHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.sm },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    row: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: Palette.borderLight },
    title: { fontSize: 14, fontWeight: "600", color: Palette.ink },
    detail: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    count: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    countText: { fontSize: 13, fontWeight: "700" },
    markButton: { paddingVertical: 6, paddingHorizontal: 4 },
    markText: { fontSize: 13, fontWeight: "700" },
  });
}
