import React from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Accent, Palette, Radius, Shadow, Spacing, Type } from "@/constants/theme";
import { SectionHeader, LoadingSpinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
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

function getInitials(name?: string) {
  if (!name) return "S";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const STATUS_COLORS: Record<string, string> = {
  completed: Accent.green.fg,
  in_progress: Accent.amber.fg,
  overdue: Accent.red.fg,
};

function formatDeadline(assignment: ScenarioAssignment): string {
  if (!assignment.deadline) return "No deadline";
  return new Date(assignment.deadline).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Faint ECG trace drifting across the Next Up hero card. */
function HeroPulse({ width }: { width: number }) {
  const y = 74;
  const pulse = [
    `M0 ${y}`,
    `L${width * 0.42} ${y}`,
    `L${width * 0.48} ${y - 18}`,
    `L${width * 0.54} ${y + 22}`,
    `L${width * 0.59} ${y - 6}`,
    `L${width * 0.64} ${y}`,
    `L${width} ${y}`,
  ].join(" ");
  return (
    <Svg width={width} height={110} style={StyleSheet.absoluteFill} pointerEvents="none"></Svg>
  );
}

export default function DashboardScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuth();

  const { data, loading, refreshing, refresh } = useApiData(() =>
    allCached(fetchScenarioAssignments(), fetchAssessments(), fetchProgress(), fetchPatients()),
  );
  const [assignments, assessments, progress, patients] = data ?? [[], [], null, []];

  if (loading && !data) {
    return <LoadingSpinner />;
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

  const heroWidth = width - Spacing.lg * 2;

  const stats = [
    {
      label: "Pending Tasks",
      value: String(openTasks.length),
      icon: "clipboard-list",
      accent: Accent.teal,
      href: "/tasks",
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
      href: "/tasks/quizzes",
    },
    {
      label: "My Patients",
      value: String(patients.length),
      icon: "hospital-user",
      accent: Accent.cyan,
      href: "/ehr",
    },
  ];

  const quickActions = [
    { label: "Vitals", icon: "heart-pulse", accent: Accent.red, href: "/vitals" },
    { label: "Tasks", icon: "list-check", accent: Accent.amber, href: "/tasks" },
    { label: "Quizzes", icon: "file-lines", accent: Accent.violet, href: "/tasks/quizzes" },
    { label: "AI Tips", icon: "lightbulb", accent: Accent.blue, href: "/recommendations" },
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
      {/* Greeting */}
      <Animated.View entering={FadeInDown.duration(220)} style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{user?.name || "Student"}</Text>
          <View style={styles.dateRow}>
            <FontAwesome6 name="calendar-day" size={11} color={Teal.primary} />
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [pressed && styles.pressedDim]}
          onPress={() => router.push("/profile")}
        >
          <LinearGradient
            colors={[Teal.light, Teal.primary, Teal.deep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      {/* Next Up hero */}
      {nextTask && (
        <Animated.View entering={FadeInDown.duration(220).delay(40)}>
          <Pressable
            style={({ pressed }) => [styles.heroWrap, pressed && styles.pressedCard]}
            onPress={() => router.push(`/tasks/${nextTask.id}`)}
          >
            <LinearGradient
              colors={[Teal.deepest, Teal.deep, Teal.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1.1, y: 1.4 }}
              style={styles.heroCard}
            >
              <HeroPulse width={heroWidth} />
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

      {/* Quick Actions */}
      <Animated.View entering={FadeInDown.duration(220).delay(120)} style={styles.section}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressedDim]}
              onPress={() => router.push(action.href as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.accent.bg }]}>
                <FontAwesome6 name={action.icon} size={19} solid color={action.accent.fg} />
              </View>
              <Text style={styles.quickActionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {/* Scenarios */}
      <Animated.View entering={FadeInDown.duration(220).delay(160)} style={styles.section}>
        <SectionHeader
          title={nextTask ? "Up Later" : "Assigned Scenarios"}
          subtitle={`${openTasks.length} pending`}
          actionLabel="See all"
          onAction={() => router.push("/tasks")}
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
                onPress={() => router.push(`/tasks/${task.id}`)}
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

const styles = StyleSheet.create({
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
    marginBottom: Spacing.lg,
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
