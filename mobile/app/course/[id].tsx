import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useApiData } from "@/hooks/useApiData";
import { EmptyState, SkeletonBlock, SyncStatus } from "@/components/ui";
import { StatusDot, useRequirementTicks } from "@/components/RequirementTicks";
import { fetchCourseProgress, type CourseRequirement, type ItemProgress } from "@/lib/api";
import { TERM_STATUS_LABEL, canAct, statusText } from "@/lib/courses";

type Segment = "checklist" | "students";

/**
 * One course: its checklist with how many students met each item (tap an item
 * to see who, and tick), and its students with their totals.
 */
export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const { data, loading, refreshing, error, refresh, reload } = useApiData(() => fetchCourseProgress(id));
  const [segment, setSegment] = useState<Segment>("checklist");
  const [open, setOpen] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ItemProgress>>({});

  const itemFor = (studentId: string, requirementId: string): ItemProgress | undefined =>
    overrides[`${studentId}:${requirementId}`] ?? data?.progress[studentId]?.[requirementId];

  const { act, busy, sheet } = useRequirementTicks((studentId, requirementId, item) =>
    setOverrides((prev) => ({ ...prev, [`${studentId}:${requirementId}`]: item })),
  );

  const students = data?.students ?? [];
  const requirements = data?.requirements ?? [];
  const metCount = (r: CourseRequirement) => students.filter((s) => itemFor(s.id, r.id)?.done).length;
  const studentDone = (studentId: string) => requirements.filter((r) => itemFor(studentId, r.id)?.done).length;

  const onRefresh = () => {
    setOverrides({});
    refresh();
  };

  return (
    <>
      <Stack.Screen options={{ title: data?.offering.course.code ?? "Course" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Palette.primary]} tintColor={Palette.primary} />}
      >
        <SyncStatus onSynced={reload} />
        {loading ? (
          <View accessibilityLabel="Loading the course">
            <SkeletonBlock width="75%" height={22} />
            <SkeletonBlock width="60%" height={13} style={{ marginTop: 8, marginBottom: Spacing.lg }} />
            <View style={styles.segment}>
              <View style={[styles.segmentItem, styles.segmentActive]}>
                <SkeletonBlock width={90} height={13} />
              </View>
              <View style={styles.segmentItem}>
                <SkeletonBlock width={90} height={13} />
              </View>
            </View>
            {[0, 1, 2, 3].map((index) => (
              <View key={index} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.number}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <SkeletonBlock width={["75%", "60%", "70%", "55%"][index] as `${number}%`} height={15} />
                    <View style={styles.track} />
                    <SkeletonBlock width={150} height={11} />
                  </View>
                  <Ionicons name="chevron-down" size={18} color={Palette.textFaint} />
                </View>
              </View>
            ))}
          </View>
        ) : !data ? (
          <EmptyState icon="cloud-offline-outline" message={error ?? "This course could not be loaded."} />
        ) : (
          <>
            <Text style={Type.title}>{data.offering.course.title}</Text>
            <Text style={styles.subtitle}>
              {data.offering.term.name} · {TERM_STATUS_LABEL[data.offering.status]} · {students.length} student
              {students.length === 1 ? "" : "s"}
            </Text>

            <View style={styles.segment}>
              {(
                [
                  ["checklist", `Checklist (${requirements.length})`],
                  ["students", `Students (${students.length})`],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setSegment(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: segment === key }}
                  style={[styles.segmentItem, segment === key && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, segment === key && { color: Palette.primary }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {segment === "checklist" &&
              (requirements.length === 0 ? (
                <EmptyState icon="list-outline" message="No requirements yet. Add them on the web portal." />
              ) : (
                requirements.map((r, index) => {
                  const met = metCount(r);
                  const expanded = open === r.id;
                  return (
                    <View key={r.id} style={styles.card}>
                      <Pressable
                        onPress={() => setOpen(expanded ? null : r.id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        style={styles.cardHeader}
                      >
                        <Text style={styles.number}>{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{r.title || r.label}</Text>
                          {r.title && r.kind !== "manual" ? <Text style={styles.itemDetail}>{r.label}</Text> : null}
                          <View style={styles.track}>
                            <View style={[styles.fill, { width: `${students.length ? (met / students.length) * 100 : 0}%` }]} />
                          </View>
                          <Text style={styles.itemDetail}>
                            {met} of {students.length} met · {r.kind === "manual" ? "you tick it" : "ticks when graded"}
                          </Text>
                        </View>
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Palette.textFaint} />
                      </Pressable>
                      {expanded &&
                        students.map((s) => {
                          const item = itemFor(s.id, r.id);
                          const key = `${s.id}:${r.id}`;
                          const tick = () => act({ offeringId: id, studentId: s.id, studentName: s.name, requirement: r, item });
                          return (
                            <View key={s.id} style={styles.studentRow}>
                              <StatusDot requirement={r} item={item} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.studentName} numberOfLines={1}>
                                  {s.name}
                                </Text>
                                <Text style={styles.itemDetail} numberOfLines={2}>
                                  {statusText(r, item)}
                                </Text>
                              </View>
                              {r.kind === "manual" ? (
                                <Switch
                                  value={Boolean(item?.done)}
                                  onValueChange={tick}
                                  disabled={busy === key}
                                  trackColor={{ true: Palette.primary, false: Palette.border }}
                                  accessibilityLabel={`${s.name}: ${r.title}`}
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
                        })}
                    </View>
                  );
                })
              ))}

            {segment === "students" &&
              (students.length === 0 ? (
                <EmptyState icon="people-outline" message="No students yet: they come from the groups you supervise in this course's sections." />
              ) : (
                <View style={styles.card}>
                  {students.map((s, i) => {
                    const done = studentDone(s.id);
                    const complete = requirements.length > 0 && done === requirements.length;
                    const tone = complete ? Accent.green : done === 0 ? Accent.red : Accent.amber;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => router.push({ pathname: "/student/[id]", params: { id: s.id, name: s.name } })}
                        style={({ pressed }) => [styles.listRow, i > 0 && styles.rowBorder, pressed && { opacity: 0.7 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.studentName}>{s.name}</Text>
                          <Text style={styles.itemDetail}>{s.group_label}</Text>
                        </View>
                        <View style={[styles.count, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.countText, { color: tone.fg }]}>
                            {done}/{requirements.length}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
          </>
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
    subtitle: { fontSize: 13, color: Palette.textSecondary, marginTop: 2, marginBottom: Spacing.lg },
    segment: { flexDirection: "row", backgroundColor: Palette.surfaceMuted, borderRadius: Radius.md, padding: 3, marginBottom: Spacing.lg },
    segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: Radius.sm },
    segmentActive: { backgroundColor: Palette.surface },
    segmentText: { fontSize: 14, fontWeight: "600", color: Palette.textSecondary },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      marginBottom: Spacing.md,
      overflow: "hidden",
      ...Shadow.card,
    },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md, padding: Spacing.md },
    number: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: Palette.surfaceMuted,
      textAlign: "center",
      lineHeight: 26,
      fontSize: 12,
      fontWeight: "700",
      color: Palette.textSecondary,
      overflow: "hidden",
    },
    itemTitle: { fontSize: 15, fontWeight: "600", color: Palette.ink },
    itemDetail: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    track: { height: 5, borderRadius: 3, backgroundColor: Palette.borderLight, overflow: "hidden", marginTop: Spacing.sm },
    fill: { height: 5, borderRadius: 3, backgroundColor: Palette.primary },
    studentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    studentName: { fontSize: 14, fontWeight: "600", color: Palette.ink },
    markButton: { paddingVertical: 6, paddingHorizontal: 4 },
    markText: { fontSize: 13, fontWeight: "700" },
    listRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: Palette.borderLight },
    count: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    countText: { fontSize: 13, fontWeight: "700" },
  });
}
