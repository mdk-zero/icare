import React from "react";
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  ScreenHeader,
  SectionHeader,
  EmptyState,
  SkeletonScreen,
  SkeletonBlock,
  RoomPages,
  Badge,
} from "@/components/ui";
import { useApiData } from "@/hooks/useApiData";
import { FloorPlan } from "@/components/FloorPlan";
import {
  fetchWard,
  fetchAiTips,
  fetchMyCases,
  AiTip,
  WardRoom,
  WardPatient,
  WardAssignment,
  CaseListItem,
} from "@/lib/api";

/**
 * The Clinic tab: the ward's floor plan as the Dean laid it out first (rooms
 * not on the plan follow as cards, four to a page, as does the whole ward
 * before any room is placed), then the student's patient cases, open and
 * completed, and their hospital case write-ups. Students find the room with
 * their patient and walk into it to read the scenario brief and task
 * checklist. The ward arrives in one cached read (/api/student/ward), so the
 * rooms still show offline.
 */

function AssignmentBanner({
  assignment,
  patient,
  room,
  onPress,
}: {
  assignment: WardAssignment;
  patient: WardPatient | null;
  room: WardRoom | null;
  onPress: () => void;
}) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const progress = assignment.tasks_total > 0 ? assignment.tasks_done / assignment.tasks_total : 0;
  const overdue = assignment.status === "overdue";

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, pressed && styles.pressedCard]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.bannerHeader}>
        <View style={[styles.bannerIcon, { backgroundColor: Accent.teal.bg }]}>
          <Ionicons name="pulse" size={17} color={Accent.teal.fg} />
        </View>
        <View style={styles.bannerHeaderText}>
          <Text style={styles.bannerEyebrow}>Your assignment</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {assignment.scenario_title}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
      </View>

      {patient ? (
        <View style={styles.bannerRow}>
          <Ionicons name="bed-outline" size={13} color={Palette.textSecondary} />
          <Text style={styles.bannerRowText} numberOfLines={1}>
            {patient.name}
            {room ? ` · ${room.name} · Room ${room.room_number}` : ""}
          </Text>
        </View>
      ) : (
        <View style={styles.bannerRow}>
          <Ionicons name="alert-circle-outline" size={13} color={Accent.amber.fg} />
          <Text style={[styles.bannerRowText, { color: Accent.amber.fg }]}>
            No patient linked — ask your instructor
          </Text>
        </View>
      )}

      {assignment.tasks_total > 0 ? (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: Palette.borderLight }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: Palette.primary },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {assignment.tasks_done}/{assignment.tasks_total} tasks
          </Text>
        </View>
      ) : null}

      <View style={styles.bannerFooter}>
        <View
          style={[
            styles.pill,
            { backgroundColor: assignment.required ? Accent.red.bg : Accent.slate.bg },
          ]}
        >
          <Text
            style={[
              styles.pillText,
              { color: assignment.required ? Accent.red.fg : Accent.slate.fg },
            ]}
          >
            {assignment.required ? "Required" : "Optional"}
          </Text>
        </View>
        <View style={styles.dueRow}>
          <Ionicons
            name={overdue ? "alert-outline" : "time-outline"}
            size={12}
            color={overdue ? Accent.red.fg : Palette.textMuted}
          />
          <Text style={[styles.dueText, overdue && { color: Accent.red.fg }]}>
            {assignment.deadline
              ? `Due ${new Date(assignment.deadline).toLocaleDateString([], { month: "short", day: "numeric" })}`
              : "No deadline"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TipCard({ tip }: { tip: AiTip }) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  return (
    <View style={styles.tipCard}>
      <View style={[styles.tipIconBox, { backgroundColor: Accent.blue.bg }]}>
        <Ionicons name="bulb" size={14} color={Accent.blue.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        {tip.scenario_title ? (
          <Text style={styles.tipScenario} numberOfLines={1}>
            {tip.scenario_title}
          </Text>
        ) : null}
        <Text style={styles.tipText}>{tip.tip}</Text>
      </View>
    </View>
  );
}

export default function ClinicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );

  const { data, loading, refreshing, error, fromCache, refresh, reload } = useApiData(fetchWard);
  // Separate call: a slow LLM generation must never hold up the ward.
  const tips = useApiData(fetchAiTips);
  const cases = useApiData(fetchMyCases);

  // Faculty check tasks off in the meantime, so the counters are stale on return.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // A case edited or handed in comes back with a new status.
      cases.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  const refreshTips = tips.refresh;
  const refreshCases = cases.refresh;
  const handleRefresh = React.useCallback(() => {
    refresh();
    refreshTips();
    refreshCases();
  }, [refresh, refreshTips, refreshCases]);

  const openAssignment = React.useCallback(
    (assignment: WardAssignment) => {
      if (assignment.patient_id) router.push(`/clinic/patient/${assignment.patient_id}`);
      else router.push(`/clinic/assignment/${assignment.id}`);
    },
    [router],
  );

  if (loading && !data) {
    return <SkeletonScreen topOffset={insets.top + 88} />;
  }

  const rooms = data?.rooms ?? [];
  const patients = data?.patients ?? [];
  const assignments = data?.assignments ?? [];
  const fixtures = data?.fixtures ?? [];
  const onPlan = rooms.filter(
    (r) => r.plan_x != null && r.plan_y != null && r.plan_w != null && r.plan_h != null,
  );
  const offPlan = onPlan.length > 0 ? rooms.filter((r) => !onPlan.includes(r)) : rooms;

  const patientsById = new Map(patients.map((p) => [p.id, p]));
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const openAssignments = assignments.filter((a) => a.status !== "completed");
  // Newest graded first; the list comes newest-assigned first.
  const completedAssignments = assignments
    .filter((a) => a.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  // The room to ring on the plan: the first open assignment's patient.
  const myRoomId =
    openAssignments
      .map((a) => (a.patient_id ? patientsById.get(a.patient_id)?.room_id : null))
      .find((roomId): roomId is string => Boolean(roomId)) ?? null;

  const tipList = tips.data?.tips ?? [];
  const caseList = cases.data ?? [];
  const showTips = tips.loading || tipList.length > 0 || Boolean(tips.error);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      <ScreenHeader eyebrow="Ward" title="Clinic" icon="medkit-outline" />

      {fromCache ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: Accent.amber.bg, borderColor: Accent.amber.border },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={14} color={Accent.amber.fg} />
          <Text style={[styles.noticeText, { color: Accent.amber.fg }]}>
            Offline — showing the last synced ward
          </Text>
        </View>
      ) : null}

      {error && !data ? <EmptyState icon="cloud-offline-outline" message={error} /> : null}

      <View style={styles.section}>
        <SectionHeader title="Room Layout" subtitle="Tap a room to see who is in it" />
        {onPlan.length > 0 ? (
          <FloorPlan
            rooms={onPlan}
            fixtures={fixtures}
            highlightRoomId={myRoomId}
            onPressRoom={(room) => router.push(`/clinic/room/${room.id}`)}
          />
        ) : null}
        {offPlan.length > 0 ? (
          <View style={onPlan.length > 0 ? styles.offPlan : undefined}>
            {onPlan.length > 0 ? (
              <Text style={styles.offPlanTitle}>Not on the plan yet</Text>
            ) : null}
            <RoomPages
              rooms={offPlan}
              highlightRoomId={myRoomId}
              onPressRoom={(room) => router.push(`/clinic/room/${room.id}`)}
            />
          </View>
        ) : null}
        {rooms.length === 0 ? (
          <EmptyState icon="bed-outline" message="No rooms have been set up yet." />
        ) : null}
      </View>

      {openAssignments.length > 0
        ? openAssignments.map((assignment) => (
            <AssignmentBanner
              key={assignment.id}
              assignment={assignment}
              patient={
                assignment.patient_id ? (patientsById.get(assignment.patient_id) ?? null) : null
              }
              room={
                assignment.patient_id
                  ? (roomsById.get(patientsById.get(assignment.patient_id)?.room_id ?? "") ?? null)
                  : null
              }
              onPress={() => openAssignment(assignment)}
            />
          ))
        : null}

      {completedAssignments.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Completed Patient Cases" count={completedAssignments.length} />
          {completedAssignments.map((assignment) => (
            <CompletedCaseCard
              key={assignment.id}
              assignment={assignment}
              patient={
                assignment.patient_id ? (patientsById.get(assignment.patient_id) ?? null) : null
              }
              // The brief, not the patient: a patient's page follows their open case.
              onPress={() => router.push(`/clinic/assignment/${assignment.id}`)}
            />
          ))}
        </View>
      ) : null}

      {caseList.length > 0 || cases.loading ? (
        <View style={styles.section}>
          <SectionHeader
            title="Hospital Cases"
            subtitle="Write up a patient from your duty — initials only"
          />
          {cases.loading && caseList.length === 0 ? (
            <View style={styles.tipCard}>
              <View style={styles.tipBody}>
                <SkeletonBlock width="60%" height={13} />
                <SkeletonBlock width="35%" height={11} style={styles.tipSkeletonLine} />
              </View>
            </View>
          ) : (
            caseList.map((item) => (
              <CaseCard
                key={item.id}
                item={item}
                onPress={() => router.push(`/cases/${item.id}`)}
              />
            ))
          )}
        </View>
      ) : null}

      {showTips ? (
        <View style={styles.section}>
          <SectionHeader
            title="AI Study Tips"
            subtitle="Generated from your assigned patient cases"
          />
          {tips.loading && tipList.length === 0 ? (
            <View style={styles.tipCard}>
              <View style={styles.tipBody}>
                <SkeletonBlock width="55%" height={13} />
                <SkeletonBlock width="100%" height={11} style={styles.tipSkeletonLine} />
                <SkeletonBlock width="80%" height={11} style={styles.tipSkeletonLine} />
              </View>
            </View>
          ) : tipList.length > 0 ? (
            tipList.map((tip, index) => <TipCard key={`${tip.title}-${index}`} tip={tip} />)
          ) : (
            <EmptyState
              icon="cloud-offline-outline"
              message={tips.error ?? "No tips available right now."}
            />
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const CASE_STATUS: Record<
  CaseListItem["status"],
  { label: string; variant: "default" | "warning" | "info" | "success" }
> = {
  not_started: { label: "Not started", variant: "default" },
  draft: { label: "Draft", variant: "warning" },
  submitted: { label: "Handed in", variant: "info" },
  graded: { label: "Graded", variant: "success" },
};

/** A graded patient case: its score and when it was graded. Opens the brief with every task's grade. */
function CompletedCaseCard({
  assignment,
  patient,
  onPress,
}: {
  assignment: WardAssignment;
  patient: WardPatient | null;
  onPress: () => void;
}) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const graded = assignment.completed_at
    ? new Date(assignment.completed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.tipCard, styles.caseCard, pressed && styles.pressedCard]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${assignment.scenario_title}, completed${assignment.score !== null ? `, ${assignment.score}%` : ""}`}
    >
      <View style={[styles.bannerIcon, { backgroundColor: Accent.green.bg }]}>
        <Ionicons name="checkmark-done" size={17} color={Accent.green.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={Type.itemTitle} numberOfLines={1}>
          {assignment.scenario_title}
        </Text>
        <View style={styles.caseMeta}>
          <Badge label="Completed" variant="success" size="sm" />
          {assignment.score !== null ? <Text style={Type.caption}>{assignment.score}%</Text> : null}
          {graded ? <Text style={Type.caption}>Graded {graded}</Text> : null}
        </View>
        {patient ? (
          <Text style={[Type.caption, styles.completedPatient]} numberOfLines={1}>
            {patient.name}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
    </Pressable>
  );
}

function CaseCard({ item, onPress }: { item: CaseListItem; onPress: () => void }) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const status = CASE_STATUS[item.status];
  const due = item.presentation.deadline
    ? new Date(item.presentation.deadline).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.tipCard, styles.caseCard, pressed && styles.pressedCard]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.presentation.title}, ${status.label}`}
    >
      <View style={[styles.bannerIcon, { backgroundColor: Accent.teal.bg }]}>
        <Ionicons name="document-text-outline" size={17} color={Accent.teal.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={Type.itemTitle} numberOfLines={1}>
          {item.presentation.title}
        </Text>
        <View style={styles.caseMeta}>
          <Badge label={status.label} variant={status.variant} size="sm" />
          {item.late ? <Badge label="Late" variant="danger" size="sm" /> : null}
          {item.status === "graded" && item.score !== null ? (
            <Text style={Type.caption}>{item.score}%</Text>
          ) : due ? (
            <Text style={Type.caption}>Due {due}</Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
    </Pressable>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>["Palette"],
  Accent: ReturnType<typeof useTheme>["Accent"],
  Shadow: ReturnType<typeof useTheme>["Shadow"],
  Type: ReturnType<typeof useTheme>["Type"],
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Palette.background,
    },
    content: {
      padding: Spacing.lg,
      paddingBottom: 128,
    },
    pressedCard: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    noticeText: {
      fontSize: 12,
      fontWeight: "600",
      flex: 1,
    },
    section: {
      marginBottom: Spacing.xxl,
    },
    offPlan: { marginTop: Spacing.lg },
    offPlanTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: Palette.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: Spacing.sm,
    },
    banner: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.primaryTint,
      ...Shadow.card,
    },
    bannerHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    bannerIcon: {
      width: 36,
      height: 36,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
      marginRight: Spacing.md,
    },
    bannerHeaderText: {
      flex: 1,
    },
    bannerEyebrow: {
      ...Type.eyebrow,
      color: Palette.primary,
    },
    bannerTitle: Type.itemTitle,
    bannerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: Spacing.sm,
    },
    bannerRowText: {
      fontSize: 12,
      color: Palette.textSecondary,
      flex: 1,
    },
    progressWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: Palette.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    bannerFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.md,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.pill,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    dueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dueText: {
      fontSize: 12,
      color: Palette.textMuted,
    },
    tipCard: {
      flexDirection: "row",
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.sm + 2,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    tipIconBox: {
      width: 28,
      height: 28,
      borderRadius: Radius.sm,
      alignItems: "center",
      justifyContent: "center",
      marginRight: Spacing.md,
    },
    tipBody: {
      flex: 1,
    },
    caseCard: {
      alignItems: "center",
    },
    completedPatient: { marginTop: 4 },
    caseMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: Spacing.sm,
      marginTop: 6,
    },
    tipTitle: Type.itemTitle,
    tipScenario: {
      fontSize: 11,
      fontWeight: "600",
      color: Palette.textMuted,
      marginTop: 2,
    },
    tipText: {
      fontSize: 13,
      color: Palette.textSecondary,
      lineHeight: 19,
      marginTop: 6,
    },
    tipSkeletonLine: {
      marginTop: 8,
    },
  });
}
