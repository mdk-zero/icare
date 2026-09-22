import React from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { SectionHeader, SkeletonScreen, SyncStatus } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarImage } from "@/hooks/useAvatar";
import { useApiData, allCached } from "@/hooks/useApiData";
import {
  fetchScenarioAssignments,
  fetchAssessments,
  fetchProgress,
  fetchPatients,
  ScenarioAssignment,
} from "@/lib/api";

/** Teal ramp sampled from the pill logo's cap (same as login/header/tab bar). */
const Teal = {
  deepest: "#082E38",
  deep: "#0D4550",
  primary: "#1B6B7B",
  light: "#35859B",
  aqua: "#9FC8D2",
};

const today = new Date();
const dateStr = today.toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Duty band by the clock, following the AM/PM/night convention the schema's
 * shift_type enum uses (migration 029). The shifts table itself is not
 * reachable from mobile yet, so this frames the screen by time of day rather
 * than by a roster entry.
 */
function getShiftLabel() {
  const hour = new Date().getHours();
  if (hour < 6) return "NIGHT SHIFT";
  if (hour < 14) return "AM SHIFT";
  if (hour < 22) return "PM SHIFT";
  return "NIGHT SHIFT";
}

/** Null when sex is unrecorded, which is the default for every account. */
function getHonorific(sex?: "male" | "female" | null): string | null {
  if (sex === "male") return "Mr.";
  if (sex === "female") return "Ms.";
  return null;
}

/**
 * Particles that belong to the surname following them. The roster stores one
 * `name` string, so the last token is otherwise all there is to go on — and
 * that greets "Juan Santos Dela Cruz" as "Mr. Cruz".
 */
const SURNAME_PARTICLES = new Set([
  "de", "del", "dela", "delas", "delos", "della", "di", "da", "das", "dos",
  "la", "las", "los", "san", "santa", "sta", "sto", "van", "von", "bin",
]);

/** Generational and credential suffixes; never part of the surname. */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "rn"]);

/**
 * Splits a stored roster name into the two parts the greeting uses. Both the
 * faculty form and the CSV import write first, middle and last into one
 * `name` string, so the middle name has to be dropped here.
 */
function splitName(fullName: string): { first: string; surname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const strip = (part: string) => part.toLowerCase().replace(/[.,]/g, "");
  while (parts.length > 1 && NAME_SUFFIXES.has(strip(parts[parts.length - 1]))) {
    parts.pop();
  }
  if (parts.length === 0) return { first: "", surname: "" };
  if (parts.length === 1) return { first: parts[0], surname: "" };
  // Walk back over particles, but never past the first token: a two-word name
  // is a first name and a surname, not a particle and a surname.
  let start = parts.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(strip(parts[start - 1]))) start -= 1;
  return { first: parts[0], surname: parts.slice(start).join(" ") };
}

/**
 * How the ward would address this student: honorific, first name, surname —
 * "Ms. Maria Dela Cruz" for a roster entry of "Maria Reyes Dela Cruz".
 *
 * The honorific appears only once sex is recorded, so nobody is ever greeted
 * with a guessed one; the name still drops to first and last either way.
 */
function getAddressedName(user: { name?: string; sex?: "male" | "female" | null } | null): string {
  const fullName = user?.name?.trim();
  if (!fullName) return "Student";
  const { first, surname } = splitName(fullName);
  const shortName = [first, surname].filter(Boolean).join(" ") || fullName;
  const title = getHonorific(user?.sex);
  return title ? `${title} ${shortName}` : shortName;
}

/**
 * First letter of the first name plus the last — the same initials the
 * profile screen shows, which this avatar opens.
 */
function getInitials(name?: string) {
  const words = (name ?? "").trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "S";
  const letterOf = (w: string) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  const last = words.length > 1 ? letterOf(words[words.length - 1]) : "";
  return (letterOf(words[0]) + last).toUpperCase() || "S";
}

function statusColors(Accent: ReturnType<typeof useTheme>["Accent"]): Record<string, string> {
  return {
    completed: Accent.green.fg,
    in_progress: Accent.amber.fg,
    overdue: Accent.red.fg,
  };
}

function formatDeadline(assignment: ScenarioAssignment): string {
  if (!assignment.deadline) return "No deadline";
  return new Date(assignment.deadline).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function DashboardScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // A scenario is worked on its patient now, in the Clinic tab. Scenarios with
  // no patient linked still have a brief-only screen to land on.
  const openAssignment = React.useCallback(
    (assignment: ScenarioAssignment) => {
      if (assignment.patient_id) router.push(`/clinic/patient/${assignment.patient_id}`);
      else router.push(`/clinic/assignment/${assignment.id}`);
    },
    [router],
  );
  const { user } = useAuth();
  const { source: avatarSource } = useAvatarImage(user);
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(
    () => createStyles(Palette, Accent, Shadow, Type),
    [Palette, Accent, Shadow, Type],
  );
  const STATUS_COLORS = React.useMemo(() => statusColors(Accent), [Accent]);

  const { data, loading, refreshing, refresh } = useApiData(() =>
    allCached(fetchScenarioAssignments(), fetchAssessments(), fetchProgress(), fetchPatients()),
  );
  const [assignments, assessments, progress, patients] = data ?? [[], [], null, []];

  if (loading && !data) {
    return <SkeletonScreen topOffset={insets.top + 88} />;
  }

  const openTasks = assignments.filter((a) => a.status !== "completed");
  const nextTask = openTasks[0] ?? null;
  const laterTasks = nextTask ? openTasks.slice(1, 4) : [];
  const scoredAttempts = (progress?.attempts ?? []).filter((a) => a.score !== null);
  const avgScore =
    scoredAttempts.length > 0
      ? Math.round(
          scoredAttempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / scoredAttempts.length,
        )
      : null;
  const quizzesAvailable = assessments.filter((a) => a.attempt_count === 0).length;

  // Shift handover, in the ward's own terms. Both lines come from data this
  // screen already loads, so they move with the day rather than being decor.
  const handover = [
    {
      icon: "hospital-user",
      color: Accent.cyan.fg,
      text:
        patients.length === 0
          ? "No patients assigned to you yet"
          : `${patients.length} patient${patients.length === 1 ? "" : "s"} under your care`,
    },
    {
      icon: "clipboard-list",
      color: openTasks.length === 0 ? Accent.green.fg : Accent.amber.fg,
      text:
        openTasks.length === 0
          ? "Nothing pending — your list is clear"
          : `${openTasks.length} task${openTasks.length === 1 ? "" : "s"} pending this shift`,
    },
  ];

  const stats = [
    {
      label: "Pending Tasks",
      value: String(openTasks.length),
      icon: "clipboard-list",
      accent: Accent.teal,
      href: "/clinic",
    },
    {
      label: "Avg Score",
      value: avgScore === null ? "—" : `${avgScore}%`,
      icon: "chart-line",
      accent: Accent.green,
      href: "/progress",
    },
    {
      label: "Quizzes Available",
      value: String(quizzesAvailable),
      icon: "file-lines",
      accent: Accent.violet,
      href: "/quiz",
    },
    {
      label: "My Patients",
      value: String(patients.length),
      icon: "hospital-user",
      accent: Accent.cyan,
      href: "/clinic",
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          colors={[Palette.primary]}
          tintColor={Palette.primary}
        />
      }
    >
      {/* Offline / queued-write state; renders nothing when there is nothing to say. */}
      <SyncStatus onSynced={refresh} />

      {/* Greeting — framed as a duty roster: who is on, what they walk into. */}
      <Animated.View entering={FadeInDown.duration(220)} style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <View style={styles.dutyPill}>
            <View style={styles.dutyDot} />
            <Text style={styles.dutyText}>ON DUTY · {getShiftLabel()}</Text>
          </View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name} numberOfLines={2}>
            {getAddressedName(user)}
          </Text>
          <View style={styles.dateRow}>
            <FontAwesome6 name="calendar-day" size={11} color={Teal.primary} />
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
        </View>
        {/* The only way into the profile now that it has no tab of its own. */}
        <Pressable
          style={({ pressed }) => [pressed && styles.pressedDim]}
          onPress={() => router.push("/profile")}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {avatarSource ? (
            <Image source={avatarSource} style={styles.avatar} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[Teal.light, Teal.primary, Teal.deep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </LinearGradient>
          )}
        </Pressable>
      </Animated.View>

      {/* Shift handover */}
      <Animated.View entering={FadeInDown.duration(220).delay(20)} style={styles.handover}>
        {handover.map((line) => (
          <View key={line.text} style={styles.handoverRow}>
            <FontAwesome6 name={line.icon} size={12} solid color={line.color} />
            <Text style={styles.handoverText}>{line.text}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Next Up hero */}
      {nextTask && (
        <Animated.View entering={FadeInDown.duration(220).delay(40)}>
          <Pressable
            style={({ pressed }) => [styles.heroWrap, pressed && styles.pressedCard]}
            onPress={() => openAssignment(nextTask)}
          >
            <LinearGradient
              colors={[Teal.deepest, Teal.deep, Teal.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1.1, y: 1.4 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <Text style={styles.heroEyebrow}>NEXT UP</Text>
                {nextTask.required && (
                  <View style={styles.heroRequiredPill}>
                    <Text style={styles.heroRequiredText}>REQUIRED</Text>
                  </View>
                )}
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {nextTask.scenario_title}
              </Text>
              <View style={styles.heroBottomRow}>
                <View style={styles.heroMetaPill}>
                  <FontAwesome6 name="clock" size={11} color={Teal.aqua} />
                  <Text style={styles.heroMetaText}>Due {formatDeadline(nextTask)}</Text>
                </View>
                <View style={styles.heroGo}>
                  <FontAwesome6 name="arrow-right" size={15} solid color={Teal.primary} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* Stats */}
      <Animated.View entering={FadeInDown.duration(220).delay(80)} style={styles.statsGrid}>
        {stats.map((stat) => (
          <Pressable
            key={stat.label}
            style={({ pressed }) => [styles.statCard, pressed && styles.pressedCard]}
            onPress={() => router.push(stat.href as any)}
          >
            <View style={[styles.statIconTile, { backgroundColor: stat.accent.bg }]}>
              <FontAwesome6 name={stat.icon} size={16} solid color={stat.accent.fg} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Pressable>
        ))}
      </Animated.View>

      {/* Scenarios */}
      <Animated.View entering={FadeInDown.duration(220).delay(160)} style={styles.section}>
        <SectionHeader
          title={nextTask ? "Up Later" : "Assigned Scenarios"}
          subtitle={`${openTasks.length} pending`}
          actionLabel="See all"
          onAction={() => router.push("/clinic")}
        />
        <View style={styles.taskList}>
          {openTasks.length === 0 ? (
            <View style={styles.emptyTasksWrap}>
              <View style={styles.emptyTasksIcon}>
                <FontAwesome6 name="clipboard-list" size={18} color={Teal.primary} />
              </View>
              <Text style={styles.emptyTasks}>
                No scenarios assigned yet — your faculty will assign them here.
              </Text>
            </View>
          ) : nextTask && laterTasks.length === 0 ? (
            <View style={styles.emptyTasksWrap}>
              <View style={styles.emptyTasksIcon}>
                <FontAwesome6 name="check" size={16} solid color={Accent.green.fg} />
              </View>
              <Text style={styles.emptyTasks}>That&apos;s everything — just the one above.</Text>
            </View>
          ) : (
            (nextTask ? laterTasks : openTasks.slice(0, 3)).map((task, index) => (
              <Pressable
                key={task.id}
                style={({ pressed }) => [
                  styles.taskItem,
                  index > 0 && styles.taskItemBorder,
                  pressed && styles.pressedDim,
                ]}
                onPress={() => openAssignment(task)}
              >
                <View
                  style={[
                    styles.taskStatusBar,
                    { backgroundColor: STATUS_COLORS[task.status] ?? Palette.textFaint },
                  ]}
                />
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {task.scenario_title}
                  </Text>
                  <View style={styles.taskMeta}>
                    <FontAwesome6 name="clock" size={10} color={Palette.textMuted} />
                    <Text style={styles.taskDue}>Due {formatDeadline(task)}</Text>
                    {task.required && <Text style={styles.taskRequired}>Required</Text>}
                  </View>
                </View>
                <FontAwesome6 name="chevron-right" size={13} color={Palette.textFaint} />
              </Pressable>
            ))
          )}
        </View>
      </Animated.View>
    </ScrollView>
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
      // clears the floating tab bar so the last items can scroll above it
      paddingBottom: 128,
    },
    greetingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.md,
    },
    dutyPill: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      backgroundColor: Accent.green.bg,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      marginBottom: 6,
    },
    dutyDot: {
      width: 5,
      height: 5,
      borderRadius: Radius.pill,
      backgroundColor: Accent.green.fg,
    },
    dutyText: {
      fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.8,
      color: Accent.green.fg,
    },
    handover: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Palette.border,
      paddingTop: Spacing.md,
      marginBottom: Spacing.lg,
      gap: Spacing.xs + 2,
    },
    handoverRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    handoverText: {
      fontSize: 13,
      fontWeight: "500",
      color: Palette.text,
    },
    greetingText: {
      flex: 1,
      marginRight: Spacing.md,
    },
    greeting: {
      fontSize: 14,
      color: Palette.textSecondary,
      fontWeight: "500",
    },
    name: {
      ...Type.screenTitle,
      fontSize: 27,
      marginTop: 2,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: Spacing.xs,
    },
    dateText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: Teal.primary,
      letterSpacing: 0.2,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
      shadowColor: Teal.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    avatarText: {
      fontSize: 16,
      fontWeight: "800",
      color: "#fff",
    },
    pressedDim: {
      opacity: 0.7,
    },
    pressedCard: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    heroWrap: {
      marginBottom: Spacing.xxl,
      borderRadius: 22,
      shadowColor: Teal.deepest,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 10,
    },
    heroCard: {
      borderRadius: 22,
      padding: Spacing.xl,
      overflow: "hidden",
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.sm,
    },
    heroEyebrow: {
      fontSize: 10,
      fontWeight: "800",
      color: Teal.aqua,
      letterSpacing: 2.4,
    },
    heroRequiredPill: {
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.25)",
      borderRadius: Radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    heroRequiredText: {
      fontSize: 8.5,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: 1.2,
    },
    heroTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: -0.3,
      lineHeight: 25,
      marginBottom: Spacing.lg,
    },
    heroBottomRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    heroMetaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: Radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    heroMetaText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    heroGo: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
      marginBottom: Spacing.xxl,
    },
    statCard: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    statIconTile: {
      width: 34,
      height: 34,
      borderRadius: Radius.md - 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.md,
    },
    statValue: {
      fontSize: 26,
      fontWeight: "800",
      color: Palette.ink,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 12.5,
      color: Palette.textSecondary,
      fontWeight: "500",
      marginTop: 2,
    },
    section: {
      marginBottom: Spacing.xxl,
    },
    quickActions: {
      flexDirection: "row",
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.sm,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    quickAction: {
      flex: 1,
      alignItems: "center",
    },
    quickActionIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.sm,
    },
    quickActionText: {
      fontSize: 12,
      fontWeight: "600",
      color: Palette.text,
    },
    taskList: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      ...Shadow.card,
    },
    taskItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
    },
    taskItemBorder: {
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    taskStatusBar: {
      width: 3.5,
      height: 30,
      borderRadius: 2,
      marginRight: Spacing.md,
    },
    taskContent: {
      flex: 1,
      marginRight: Spacing.sm,
    },
    taskTitle: {
      ...Type.itemTitle,
    },
    taskMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 3,
    },
    taskDue: {
      fontSize: 12,
      color: Palette.textMuted,
      marginLeft: 5,
    },
    taskRequired: {
      fontSize: 11,
      fontWeight: "700",
      color: Accent.red.fg,
      marginLeft: Spacing.md,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    emptyTasksWrap: {
      alignItems: "center",
      paddingVertical: Spacing.xl,
      gap: Spacing.sm,
    },
    emptyTasksIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Palette.primaryTint,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTasks: {
      fontSize: 13,
      color: Palette.textMuted,
      textAlign: "center",
      paddingHorizontal: Spacing.lg,
    },
  });
}
