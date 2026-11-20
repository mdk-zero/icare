import React from "react";
import { openCase } from "@/lib/open-case";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  LayoutAnimation,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  ScreenHeader,
  SectionHeader,
  EmptyState,
  SkeletonBlock,
  RoomPages,
  Badge,
} from "@/components/ui";
import { useApiData } from "@/hooks/useApiData";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { FloorPlan, FloorPlanSkeleton } from "@/components/FloorPlan";
import { AWAITING_GRADE_LABEL, gradedLabel, isAwaitingGrade, performOn } from "@/lib/return-demos";
import {
  fetchWard,
  fetchMyCases,
  roomLabel,
  WardAssignment,
  CaseListItem,
} from "@/lib/api";
import { timeLimitLabel } from "@/lib/time-limit";

/**
 * The Clinic tab: the ward's floor plan as the Dean laid it out first (rooms
 * not on the plan follow as cards, four to a page, as does the whole ward
 * before any room is placed). Below it, Pending Tasks: open patient cases and
 * unfinished write-ups; then Graded Patient Cases and Hospital Cases. Each is
 * a dropdown that scrolls with the page. Rooms are only where students
 * perform (098): a room with the student's unfinished work is ringed, and
 * tapping a room lists what they do there. The ward arrives in one cached
 * read (/api/student/ward), so the rooms still show offline.
 */

function AssignmentBanner({
  assignment,
  onPress,
}: {
  assignment: WardAssignment;
  onPress: () => void;
}) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const progress = assignment.tasks_total > 0 ? assignment.tasks_done / assignment.tasks_total : 0;
  const waiting = isAwaitingGrade(assignment);

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

      {assignment.patient_name ? (
        <View style={styles.bannerRow}>
          <Ionicons name="person-outline" size={13} color={Palette.textSecondary} />
          <Text style={styles.bannerRowText} numberOfLines={1}>
            {assignment.patient_name}
          </Text>
        </View>
      ) : null}
      {assignment.room || assignment.time_limit_minutes ? (
        <View style={styles.bannerRow}>
          <Ionicons name="location-outline" size={13} color={Palette.textSecondary} />
          <Text style={styles.bannerRowText} numberOfLines={1}>
            {assignment.room ? roomLabel(assignment.room) : "Room to be announced"}
            {assignment.time_limit_minutes ? ` · ${timeLimitLabel(assignment.time_limit_minutes)}` : ""}
          </Text>
        </View>
      ) : null}

      {assignment.tasks_total > 0 && !waiting ? (
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
            {
              backgroundColor: waiting
                ? Accent.blue.bg
                : assignment.required
                  ? Accent.red.bg
                  : Accent.slate.bg,
            },
          ]}
        >
          <Text
            style={[
              styles.pillText,
              { color: waiting ? Accent.blue.fg : assignment.required ? Accent.red.fg : Accent.slate.fg },
              waiting && { textTransform: "none" },
            ]}
          >
            {waiting ? AWAITING_GRADE_LABEL : assignment.required ? "Required" : "Optional"}
          </Text>
        </View>
        {waiting ? null : (
          <View style={styles.dueRow}>
            <Ionicons name="calendar-outline" size={12} color={Palette.textMuted} />
            <Text style={styles.dueText}>{performOn(assignment.deadline)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

type DropdownKey = "pending" | "completed" | "hospital";

type AccentName = keyof ReturnType<typeof useTheme>["Accent"];

/**
 * A list's heading, as a card: its icon, title and count, and a line saying
 * what is in it, so a closed list still tells the student something (what is
 * next, the latest grade, how many write-ups are left).
 */
function DropdownHeading({
  title,
  count,
  open,
  onToggle,
  tone = "default",
  icon,
  accent,
  summary,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** "alert" when the count is work still to do. */
  tone?: "default" | "alert";
  icon: React.ComponentProps<typeof Ionicons>["name"];
  accent: AccentName;
  /** One line about what is inside, such as "Next: Patient Case Demo 1". */
  summary?: string;
}) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const tint = Accent[accent];
  const countColors =
    tone === "alert" && count > 0
      ? { backgroundColor: Accent.red.bg, color: Accent.red.fg }
      : { backgroundColor: Palette.primaryTint, color: Palette.primary };
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.dropdownHeading,
        open && { borderColor: tint.border },
        pressed && styles.pressedCard,
      ]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}, ${count}${summary ? `. ${summary}` : ""}`}
      accessibilityHint={open ? "Collapses the list" : "Expands the list"}
    >
      <View style={[styles.dropdownIcon, { backgroundColor: tint.bg }]}>
        <Ionicons name={icon} size={19} color={tint.fg} />
      </View>
      <View style={styles.dropdownText}>
        <View style={styles.dropdownTitleRow}>
          <Text style={styles.dropdownTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.dropdownCount, { backgroundColor: countColors.backgroundColor }]}>
            <Text style={[styles.dropdownCountText, { color: countColors.color }]}>{count}</Text>
          </View>
        </View>
        {summary ? (
          <Text style={styles.dropdownSummary} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      {/* Down while the list is showing, right while it's hidden. */}
      <View style={[styles.dropdownChevron, open && { backgroundColor: tint.bg }]}>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={open ? tint.fg : Palette.textSecondary} />
      </View>
    </Pressable>
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
  const cases = useApiData(fetchMyCases);
  // A case assigned or graded shows up at once: its notification arrives live.
  const reloadCases = cases.reload;
  useLiveRefresh(
    React.useCallback(() => {
      reload();
      reloadCases();
    }, [reload, reloadCases]),
  );

  // Faculty check tasks off in the meantime, so the counters are stale on return.
  useFocusEffect(
    React.useCallback(() => {
      if (data) reload();
      // A case edited or handed in comes back with a new status.
      cases.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  const refreshCases = cases.refresh;
  const handleRefresh = React.useCallback(() => {
    refresh();
    refreshCases();
  }, [refresh, refreshCases]);

  const openAssignment = React.useCallback(
    (assignment: WardAssignment) => {
      openCase(router, assignment);
    },
    [router],
  );

  // Pending work starts open, so it's the first thing a student sees; the
  // long lists start closed so they don't bury the ward.
  const [open, setOpen] = React.useState<Record<DropdownKey, boolean>>({
    pending: true,
    completed: false,
    hospital: false,
  });

  const toggle = (key: DropdownKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // The header and section titles need nothing fetched; the plan and the
  // assignment hold their shape until the ward arrives.
  const pending = loading && !data;

  const rooms = data?.rooms ?? [];
  const assignments = data?.assignments ?? [];
  const fixtures = data?.fixtures ?? [];
  const onPlan = rooms.filter(
    (r) => r.plan_x != null && r.plan_y != null && r.plan_w != null && r.plan_h != null,
  );
  const offPlan = onPlan.length > 0 ? rooms.filter((r) => !onPlan.includes(r)) : rooms;

  // Handed in and waiting for the Instructor's grade: nothing left to perform, so
  // it is not pending and not the "Next:" case; it shows after the open ones.
  const openAssignments = assignments.filter((a) => a.status !== "completed" && !isAwaitingGrade(a));
  const waitingAssignments = assignments.filter(isAwaitingGrade);
  // Newest graded first; the list comes newest-assigned first.
  const completedAssignments = assignments
    .filter((a) => a.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  // The room to ring on the plan: where the soonest unfinished activity is performed.
  const myRoomId =
    (data?.activities ?? [])
      .filter((a) => a.status !== "completed" && !isAwaitingGrade(a))
      .sort((a, b) => (a.deadline ?? "~").localeCompare(b.deadline ?? "~"))[0]?.room_id ?? null;

  const caseList = cases.data ?? [];
  // Write-ups still in the student's hands: not started, or a draft.
  const pendingCases = caseList.filter((c) => c.status === "not_started" || c.status === "draft");
  const pendingCount = openAssignments.length + pendingCases.length;

  // What each closed list says about itself.
  const nextUp = openAssignments[0]?.scenario_title ?? pendingCases[0]?.presentation.title ?? null;
  const latestGraded = completedAssignments[0] ?? null;
  const headings: Record<
    DropdownKey,
    { title: string; count: number; tone?: "alert"; icon: React.ComponentProps<typeof Ionicons>["name"]; accent: AccentName; summary?: string }
  > = {
    pending: {
      title: "Pending Tasks",
      count: pendingCount,
      tone: "alert",
      icon: pendingCount > 0 ? "time-outline" : "checkmark-done-outline",
      accent: pendingCount > 0 ? "amber" : "green",
      summary: pending
        ? undefined
        : nextUp
          ? `Next: ${nextUp}`
          : waitingAssignments.length > 0
            ? `${waitingAssignments.length} waiting for grade`
            : "You're all caught up",
    },
    completed: {
      title: "Graded Patient Cases",
      count: completedAssignments.length,
      icon: "ribbon-outline",
      accent: "green",
      summary: latestGraded ? `Latest: ${latestGraded.scenario_title}, ${gradedLabel(latestGraded.score)}` : undefined,
    },
    hospital: {
      title: "Hospital Cases",
      count: caseList.length,
      icon: "document-text-outline",
      accent: "teal",
      summary: cases.loading && caseList.length === 0
        ? undefined
        : pendingCases.length > 0
          ? `${pendingCases.length} to hand in`
          : "All handed in",
    },
  };

  const caseCard = (item: CaseListItem) => (
    <CaseCard key={item.id} item={item} onPress={() => router.push(`/cases/${item.id}`)} />
  );

  return (
    <View style={styles.container}>
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
          <SectionHeader title="Room Layout" subtitle="Tap a room to see what you do there" />
          {pending ? <FloorPlanSkeleton /> : null}
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
          {rooms.length === 0 && !pending ? (
            <EmptyState icon="bed-outline" message="No rooms have been set up yet." />
          ) : null}
        </View>

        {/* What the student still has to do, open from the start. */}
        <View style={styles.section}>
          <DropdownHeading {...headings.pending} open={open.pending} onToggle={() => toggle("pending")} />
          {open.pending ? (
            <View style={styles.dropdownBody}>
              {pending ? (
                <View style={styles.banner} accessibilityLabel="Loading your assignment">
                  <View style={styles.bannerHeader}>
                    <View style={[styles.bannerIcon, { backgroundColor: Accent.teal.bg }]}>
                      <Ionicons name="pulse" size={17} color={Accent.teal.fg} />
                    </View>
                    <View style={styles.bannerHeaderText}>
                      <Text style={styles.bannerEyebrow}>Your assignment</Text>
                      <SkeletonBlock width="75%" height={15} style={{ marginTop: 4 }} />
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
                  </View>
                  <View style={styles.bannerRow}>
                    <SkeletonBlock width="65%" height={12} />
                  </View>
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressTrack, { backgroundColor: Palette.borderLight }]} />
                    <SkeletonBlock width={52} height={11} />
                  </View>
                </View>
              ) : null}
              {openAssignments.map((assignment) => (
                <AssignmentBanner
                  key={assignment.id}
                  assignment={assignment}
                  onPress={() => openAssignment(assignment)}
                />
              ))}
              {waitingAssignments.map((assignment) => (
                <AssignmentBanner
                  key={assignment.id}
                  assignment={assignment}
                  onPress={() => openAssignment(assignment)}
                />
              ))}
              {pendingCases.map(caseCard)}
              {!pending && pendingCount === 0 && waitingAssignments.length === 0 ? (
                <EmptyState icon="checkmark-done-outline" message="You're all caught up. Nothing to do right now." />
              ) : null}
            </View>
          ) : null}
        </View>

        {completedAssignments.length > 0 ? (
          <View style={styles.section}>
            <DropdownHeading
              {...headings.completed}
              open={open.completed}
              onToggle={() => toggle("completed")}
            />
            {open.completed ? (
              <View style={styles.dropdownBody}>
                {completedAssignments.map((assignment) => (
                  <CompletedCaseCard
                    key={assignment.id}
                    assignment={assignment}
                    onPress={() => router.push(`/clinic/assignment/${assignment.id}`)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {caseList.length > 0 || cases.loading ? (
          <View style={styles.section}>
            <DropdownHeading {...headings.hospital} open={open.hospital} onToggle={() => toggle("hospital")} />
            {open.hospital ? (
              <View style={styles.dropdownBody}>
                <Text style={styles.dropdownNote}>Write up a patient from your duty — initials only</Text>
                {cases.loading && caseList.length === 0 ? (
                  <View style={styles.tipCard}>
                    <View style={styles.tipBody}>
                      <SkeletonBlock width="60%" height={13} />
                      <SkeletonBlock width="35%" height={11} style={styles.tipSkeletonLine} />
                    </View>
                  </View>
                ) : (
                  caseList.map(caseCard)
                )}
              </View>
            ) : null}
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

const CASE_STATUS: Record<
  CaseListItem["status"],
  { label: string; variant: "default" | "warning" | "info" | "success" }
> = {
  not_started: { label: "Not handed in", variant: "default" },
  draft: { label: "Not handed in", variant: "default" },
  submitted: { label: "Handed in", variant: "info" },
  graded: { label: "Graded", variant: "success" },
};

/** A graded patient case: its score and when it was graded. Opens the brief with every task's grade. */
function CompletedCaseCard({
  assignment,
  onPress,
}: {
  assignment: WardAssignment;
  onPress: () => void;
}) {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  return (
    <Pressable
      style={({ pressed }) => [styles.tipCard, styles.caseCard, pressed && styles.pressedCard]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${assignment.scenario_title}, ${gradedLabel(assignment.score)}`}
    >
      <View style={[styles.bannerIcon, { backgroundColor: Accent.green.bg }]}>
        <Ionicons name="checkmark-done" size={17} color={Accent.green.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={Type.itemTitle} numberOfLines={1}>
          {assignment.scenario_title}
        </Text>
        <View style={styles.caseMeta}>
          <Badge label={gradedLabel(assignment.score)} variant="success" size="sm" />
        </View>
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
      accessibilityLabel={`${item.presentation.title}, ${item.group_name}${item.is_leader ? ", you lead" : ""}, ${status.label}`}
    >
      <View style={[styles.bannerIcon, { backgroundColor: Accent.teal.bg }]}>
        <Ionicons name="people-outline" size={17} color={Accent.teal.fg} />
      </View>
      <View style={styles.tipBody}>
        <Text style={Type.itemTitle} numberOfLines={1}>
          {item.presentation.title}
        </Text>
        <View style={styles.caseMeta}>
          <Badge label={status.label} variant={status.variant} size="sm" />
          {item.is_leader ? <Badge label="Leader" variant="warning" size="sm" /> : null}
          {item.late ? <Badge label="Late" variant="danger" size="sm" /> : null}
          <Text style={Type.caption} numberOfLines={1}>{item.group_name}</Text>
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
    dropdownHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      minHeight: 64,
      paddingVertical: 12,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
      ...Shadow.card,
    },
    dropdownIcon: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    dropdownText: { flex: 1, minWidth: 0 },
    dropdownTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
    dropdownTitle: {
      ...Type.itemTitle,
      fontSize: 16,
      flexShrink: 1,
    },
    dropdownSummary: {
      ...Type.caption,
      marginTop: 2,
    },
    dropdownChevron: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Palette.surfaceMuted,
    },
    dropdownCount: {
      minWidth: 24,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radius.pill,
      alignItems: "center",
    },
    dropdownCountText: {
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    dropdownBody: {
      marginTop: Spacing.sm,
    },
    dropdownNote: {
      ...Type.caption,
      marginBottom: Spacing.md,
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
    tipSkeletonLine: {
      marginTop: 8,
    },
  });
}
