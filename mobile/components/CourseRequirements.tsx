import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { SectionHeader } from "@/components/ui";
import type { OwnCourse } from "@/lib/api";

/** Missing items shown per course before "Show N more". */
const PREVIEW = 3;

type Styles = ReturnType<typeof createStyles>;

/**
 * Home's Course Requirements: for each course this term, the checklist items
 * the student hasn't met yet and where they stand on each; met items are
 * only counted. Nothing shows without a course this term, or while the list
 * can't be loaded.
 */
export function CourseRequirements({ courses }: { courses: OwnCourse[] | null }) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);

  const listed = (courses ?? []).filter((c) => c.requirements.length > 0);
  if (listed.length === 0) return null;
  const missing = listed.reduce((n, c) => n + c.requirements.filter((r) => !r.done).length, 0);

  return (
    <View style={styles.section}>
      <SectionHeader title="Course Requirements" subtitle={missing === 0 ? "All met" : `${missing} missing`} />
      {listed.map((course) => (
        <CourseCard key={course.id} course={course} styles={styles} />
      ))}
    </View>
  );
}

function CourseCard({ course, styles }: { course: OwnCourse; styles: Styles }) {
  const { Accent, Palette } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const missing = course.requirements.filter((r) => !r.done);
  const met = course.requirements.length - missing.length;
  const shown = expanded ? missing : missing.slice(0, PREVIEW);
  const tone = missing.length === 0 ? Accent.green : Accent.amber;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.code}>{course.course.code}</Text>
          <Text style={styles.courseTitle} numberOfLines={1}>
            {course.course.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {course.instructor} · {course.term.name}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.fg }]}>
            {met}/{course.requirements.length} met
          </Text>
        </View>
      </View>

      {missing.length === 0 ? (
        <View style={styles.allMet}>
          <FontAwesome6 name="circle-check" size={14} solid color={Accent.green.fg} />
          <Text style={styles.allMetText}>Every requirement met</Text>
        </View>
      ) : (
        shown.map((r) => (
          <View key={r.id} style={styles.item}>
            <View style={styles.bar} />
            <View style={styles.flex}>
              <Text style={styles.itemName}>{r.name}</Text>
              <Text style={styles.itemDetail} numberOfLines={2}>
                {r.detail}
              </Text>
              {r.status ? <Text style={styles.itemStatus}>{r.status}</Text> : null}
            </View>
          </View>
        ))
      )}

      {missing.length > PREVIEW ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={4}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.toggleText}>{expanded ? "Show less" : `Show ${missing.length - PREVIEW} more`}</Text>
          <FontAwesome6 name={expanded ? "chevron-up" : "chevron-down"} size={11} color={Palette.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Accent: ReturnType<typeof useTheme>["Accent"],
  Shadow: ReturnType<typeof useTheme>["Shadow"],
  Type: ReturnType<typeof useTheme>["Type"],
) {
  return StyleSheet.create({
    section: { marginBottom: Spacing.xxl },
    flex: { flex: 1 },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      marginBottom: Spacing.md,
      ...Shadow.card,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.md,
      paddingVertical: 14,
    },
    code: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: Palette.primary },
    courseTitle: { ...Type.itemTitle, marginTop: 1 },
    meta: { fontSize: 12, color: Palette.textMuted, marginTop: 2 },
    pill: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 12, fontWeight: "700" },
    allMet: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    allMetText: { fontSize: 13, fontWeight: "600", color: Accent.green.fg },
    item: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    bar: { width: 3.5, alignSelf: "stretch", borderRadius: 2, marginRight: Spacing.md, backgroundColor: Accent.amber.fg },
    itemName: { fontSize: 14, fontWeight: "600", color: Palette.ink },
    itemDetail: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    itemStatus: { fontSize: 12, fontWeight: "600", color: Accent.amber.fg, marginTop: 4 },
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    toggleText: { fontSize: 13, fontWeight: "700", color: Palette.primary },
    pressed: { opacity: 0.7 },
  });
}
