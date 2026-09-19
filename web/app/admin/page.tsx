import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faUsers,
  faUserTie,
  faTriangleExclamation,
  faCircleCheck,
  faClipboardCheck,
  faUserPlus,
  faFileLines,
  faChartColumn,
  faBuilding,
} from "@fortawesome/free-solid-svg-icons";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import { readSession } from "@/app/lib/auth/session";
import Avatar from "@/app/components/Avatar";
import PageHeader from "@/app/components/PageHeader";
import StatTile from "@/app/components/StatTile";

export const metadata: Metadata = {
  title: "Overview | iCARE++",
};

// Every widget reads live OLTP data; never prerender at build time.
export const dynamic = "force-dynamic";

interface AtRiskRow {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  average_score: number | null;
  quizzes_completed: number;
}

interface ActivityRow {
  action: string;
  created_at: string;
  actor: { name: string } | null;
}

interface StudentAverageRow {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  average: number;
  count: number;
}

const SCORE_BANDS = [
  { label: "90–100", min: 90, max: 100 },
  { label: "80–89", min: 80, max: 89 },
  { label: "70–79", min: 70, max: 79 },
  { label: "60–69", min: 60, max: 69 },
  { label: "Below 60", min: 0, max: 59 },
] as const;

/** Oldest → newest, matching the order `weeklyAttempts` is filled in. */
const WEEK_LABELS = ["4w", "3w", "2w", "1w", "Now"] as const;

const PASSING_SCORE = 75;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function humanizeAction(action: string): string {
  // e.g. 'user.create' → 'user create', 'faculty.roster.update' → 'faculty roster update'
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

/**
 * Timeline marker for an audit entry, keyed off the verb at the end of the
 * action ('user.create', 'room.delete'). The faculty overview colours its feed
 * the same way: a removal reads red, a creation green, everything else brand.
 */
function activityMeta(action: string): { dot: string; ring: string } {
  const verb = action.toLowerCase();
  if (verb.includes("delete") || verb.includes("remove") || verb.includes("archive")) {
    return { dot: "bg-red-600", ring: "ring-red-100" };
  }
  if (verb.includes("create") || verb.includes("add") || verb.includes("enroll")) {
    return { dot: "bg-emerald-600", ring: "ring-emerald-100" };
  }
  return { dot: "bg-brand-600", ring: "ring-teal-100" };
}

/** One hairline card per block — the panel the faculty overview is built from. */
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      {children && <div className="shrink-0 flex items-center gap-3">{children}</div>}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-gray-500 font-medium">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

/** Score pill in the ranked lists — red once a student is under the threshold. */
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="tabular px-2.5 py-1 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
        —
      </span>
    );
  }
  const passing = score >= PASSING_SCORE;
  return (
    <span
      className={`tabular px-2.5 py-1 rounded-full text-xs font-medium border ${
        passing
          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
          : "bg-red-100 text-red-700 border-red-200"
      }`}
    >
      {score}%
    </span>
  );
}

function quizLabel(count: number): string {
  return `${count} quiz${count !== 1 ? "zes" : ""}`;
}

async function loadDashboard(viewerId: string) {
  const supabase = getSupabaseAdmin();

  const [usersRes, attemptsRes, predictionsRes, roomsRes, activityRes] =
    await Promise.all([
      supabase.from("users").select("id, name, email, role, picture_url"),
      supabase
        .from("assessment_attempts")
        .select("student_id, score, submitted_at")
        .eq("status", "submitted"),
      supabase
        .from("performance_predictions")
        .select("student_id, risk, predicted_at")
        .order("predicted_at", { ascending: false }),
      supabase.from("rooms").select("id, status"),
      supabase
        .from("audit_logs")
        .select("action, created_at, actor:users(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const users = usersRes.data ?? [];
  const attempts = attemptsRes.data ?? [];
  const activeRoomCount = (roomsRes.data ?? []).filter((r) => r.status === "active").length;

  const students = users.filter((u) => u.role === "student");
  const facultyCount = users.filter((u) => u.role === "faculty").length;

  // Per-student attempt aggregates.
  const totals = new Map<string, { count: number; sum: number }>();
  for (const a of attempts) {
    const t = totals.get(a.student_id) ?? { count: 0, sum: 0 };
    t.count += 1;
    t.sum += a.score ?? 0;
    totals.set(a.student_id, t);
  }
  const averageScore =
    attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.score ?? 0), 0) / attempts.length)
      : null;

  // Latest prediction per student (rows arrive newest-first).
  const latestRisk = new Map<string, string>();
  for (const p of predictionsRes.data ?? []) {
    if (!latestRisk.has(p.student_id)) latestRisk.set(p.student_id, p.risk);
  }
  const atRiskStudents: AtRiskRow[] = students
    .filter((s) => latestRisk.get(s.id) === "at_risk")
    .map((s) => {
      const t = totals.get(s.id);
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        picture_url: s.picture_url,
        average_score: t && t.count > 0 ? Math.round(t.sum / t.count) : null,
        quizzes_completed: t?.count ?? 0,
      };
    });

  // Submitted attempts per week for the last 5 weeks (oldest → newest).
  const weeklyAttempts = [0, 0, 0, 0, 0];
  const now = Date.now();
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const weeksAgo = Math.floor((now - new Date(a.submitted_at).getTime()) / (7 * 24 * 3_600_000));
    if (weeksAgo >= 0 && weeksAgo < 5) weeklyAttempts[4 - weeksAgo] += 1;
  }

  // Average score per student, highest first — the source for both the score
  // distribution chart and the top/bottom performer lists. Students with no
  // submitted attempts have nothing to rank, so they're left out rather than
  // shown as a false "0%".
  const studentAverages: StudentAverageRow[] = students
    .map((s) => {
      const t = totals.get(s.id);
      if (!t || t.count === 0) return null;
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        picture_url: s.picture_url,
        average: Math.round(t.sum / t.count),
        count: t.count,
      };
    })
    .filter((s): s is StudentAverageRow => s !== null)
    .sort((a, b) => b.average - a.average);

  const scoreDistribution = SCORE_BANDS.map((band) => ({
    ...band,
    count: studentAverages.filter((s) => s.average >= band.min && s.average <= band.max).length,
  }));

  return {
    // The masthead greets whoever is signed in, the way the faculty one does.
    viewerName: users.find((u) => u.id === viewerId)?.name ?? null,
    totalStudents: students.length,
    facultyCount,
    totalUsers: users.length,
    averageScore,
    totalQuizzes: attempts.length,
    atRiskStudents,
    weeklyAttempts,
    activeRoomCount,
    scoreDistribution,
    scoredStudentTotal: studentAverages.length,
    topPerformers: studentAverages.slice(0, 5),
    needsImprovement: [...studentAverages].reverse().slice(0, 5),
    activity: (activityRes.data ?? []) as unknown as ActivityRow[],
  };
}

export default async function AdminDashboard() {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect(session.role === "faculty" ? "/faculty" : "/dashboard");
  }

  const {
    viewerName,
    totalStudents,
    facultyCount,
    totalUsers,
    averageScore,
    totalQuizzes,
    atRiskStudents,
    weeklyAttempts,
    activeRoomCount,
    scoreDistribution,
    scoredStudentTotal,
    topPerformers,
    needsImprovement,
    activity,
  } = await loadDashboard(session.uid);

  const firstName = viewerName ? viewerName.split(" ")[0] : null;
  const maxWeekly = Math.max(...weeklyAttempts, 1);
  const atRiskCount = atRiskStudents.length;
  const safeCount = totalStudents - atRiskCount;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />,
          label: "Admin Dashboard",
        }}
        title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
        subtitle={`${today} • Here's what's happening across the program today.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={faUsers}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
          value={totalStudents}
          label="Total Students"
          caption={`${facultyCount} faculty · ${totalUsers} accounts`}
        />
        <StatTile
          icon={faTriangleExclamation}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          value={atRiskCount}
          label="Students at Risk"
          caption={
            totalStudents > 0 && atRiskCount > 0
              ? `${Math.round((atRiskCount / totalStudents) * 100)}% of students`
              : "No ML flags on record"
          }
        />
        <StatTile
          icon={faCircleCheck}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          value={averageScore !== null ? `${averageScore}%` : "—"}
          label="Average Score"
          caption={
            averageScore === null
              ? "No submitted attempts yet"
              : averageScore >= PASSING_SCORE
                ? `Above the ${PASSING_SCORE}% threshold`
                : `Below the ${PASSING_SCORE}% threshold`
          }
        />
        <StatTile
          icon={faClipboardCheck}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          value={totalQuizzes}
          label="Quizzes Completed"
          caption={`${weeklyAttempts[4]} in the last 7 days`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          href="/admin/rooms"
          icon={faBuilding}
          value={activeRoomCount}
          label="Active Rooms"
          caption="Manage rooms"
        />
        <StatTile
          href="/admin/faculty"
          icon={faUserTie}
          value={facultyCount}
          label="Faculty"
          caption="Faculty roster"
        />
        <StatTile
          href="/admin/users"
          icon={faUsers}
          value={totalUsers}
          label="User Accounts"
          caption="All accounts"
        />
        <StatTile
          href="/admin/analytics"
          icon={faChartColumn}
          value={`${safeCount}/${totalStudents}`}
          label="Students on Track"
          caption="Program analytics"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Score Distribution"
            subtitle="Students grouped by average assessment score"
          >
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              {scoredStudentTotal} student{scoredStudentTotal !== 1 ? "s" : ""}
            </span>
          </PanelHeader>
          {scoredStudentTotal === 0 ? (
            <EmptyState
              title="No submitted attempts yet"
              hint="Scores appear here once students start submitting assessments."
            />
          ) : (
            <div className="p-4 space-y-4">
              {scoreDistribution.map((band) => {
                const percentage = (band.count / scoredStudentTotal) * 100;
                return (
                  <div key={band.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{band.label}%</span>
                      <span className="tabular text-sm font-medium text-gray-500">
                        {band.count} student{band.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all duration-500"
                        style={{ width: `${band.count > 0 ? Math.max(percentage, 4) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Throughput sits with the scores it produced rather than crowding
              the stat tile it used to hang off. */}
          <div className="p-4 border-t border-gray-100">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2.5">
              Submitted per week · last 5
            </p>
            <div className="flex items-end gap-1.5 h-12">
              {weeklyAttempts.map((v, i) => (
                <div
                  key={i}
                  title={`${v} submitted`}
                  className="flex-1 bg-gray-100 rounded-t flex items-end"
                >
                  <div
                    className="w-full bg-brand-600 rounded-t"
                    style={{ height: `${(v / maxWeekly) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {WEEK_LABELS.map((label) => (
                <span
                  key={label}
                  className="flex-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Recent Activity" subtitle="Latest actions across the console">
            <Link
              href="/admin/audit"
              className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              Audit trail →
            </Link>
          </PanelHeader>
          {activity.length === 0 ? (
            <EmptyState
              title="No recorded activity yet"
              hint="Admin and faculty actions are logged here as they happen."
            />
          ) : (
            <div className="p-4">
              <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                {activity.map((entry, idx) => {
                  const meta = activityMeta(entry.action);
                  return (
                    <li key={idx} className="relative flex gap-3">
                      <span
                        className={`relative z-10 w-8 h-8 shrink-0 rounded-full bg-surface ring-4 ${meta.ring} flex items-center justify-center`}
                      >
                        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      </span>
                      <div className="flex-1 min-w-0 pb-0.5">
                        <p className="font-medium text-gray-900 text-sm capitalize">
                          {humanizeAction(entry.action)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {entry.actor?.name ?? "System"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {relativeTime(entry.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel>
          <PanelHeader title="Top Performers" subtitle="Highest average across submitted attempts" />
          {topPerformers.length === 0 ? (
            <EmptyState
              title="No submitted attempts yet"
              hint="The ranking fills in as assessments come back."
            />
          ) : (
            <div className="divide-y divide-hairline">
              {topPerformers.map((student, idx) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-subtle transition-colors"
                >
                  <span className="tabular w-4 shrink-0 text-center text-xs font-semibold text-gray-400">
                    {idx + 1}
                  </span>
                  <Avatar name={student.name} src={student.picture_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{student.name}</p>
                    <p className="text-sm text-gray-500 truncate">{quizLabel(student.count)}</p>
                  </div>
                  <ScoreBadge score={student.average} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Needs Improvement"
            subtitle="Lowest average across submitted attempts"
          />
          {needsImprovement.length === 0 ? (
            <EmptyState
              title="No submitted attempts yet"
              hint="The ranking fills in as assessments come back."
            />
          ) : (
            <div className="divide-y divide-hairline">
              {needsImprovement.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-subtle transition-colors"
                >
                  <Avatar
                    name={student.name}
                    src={student.picture_url}
                    size="md"
                    tone={student.average < PASSING_SCORE ? "risk" : "brand"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{student.name}</p>
                    <p className="text-sm text-gray-500 truncate">{quizLabel(student.count)}</p>
                  </div>
                  <ScoreBadge score={student.average} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Quick Actions" subtitle="Common console tasks" />
          <div className="p-4 space-y-2">
            {[
              { href: "/admin/student-management", icon: faUserPlus, label: "Enroll Student" },
              { href: "/admin/reports", icon: faFileLines, label: "Generate Report" },
              { href: "/admin/analytics", icon: faChartColumn, label: "View Analytics" },
              { href: "/admin/rooms", icon: faBuilding, label: "Manage Rooms" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-600/5 transition-colors text-left group"
              >
                <span className="w-8 h-8 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:bg-brand-600 transition-colors">
                  <FontAwesomeIcon
                    icon={action.icon}
                    className="w-4 h-4 text-brand-600 group-hover:text-white"
                  />
                </span>
                <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Students Requiring Attention"
          subtitle="Flagged by the latest ML prediction run"
        >
          {atRiskCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
              {atRiskCount} at risk
            </span>
          )}
          <Link
            href="/admin/student-management"
            className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
          >
            View All →
          </Link>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Average
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Quizzes
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {atRiskStudents.map((student) => (
                <tr key={student.id} className="hover:bg-subtle transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={student.name} src={student.picture_url} size="sm" tone="risk" />
                      <p className="font-medium text-gray-900 truncate">{student.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-gray-600 text-sm truncate">{student.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <ScoreBadge score={student.average_score} />
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="tabular text-gray-500 text-sm">{student.quizzes_completed}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      At risk
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
              {atRiskCount === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <p className="text-gray-500 font-medium">No students flagged</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Everyone is on track in the latest prediction run.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
