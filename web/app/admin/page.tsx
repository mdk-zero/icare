import type { Metadata } from "next";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faUsers,
  faTriangleExclamation,
  faCircleCheck,
  faClipboardCheck,
  faUserPlus,
  faFileLines,
  faChartColumn,
  faBuilding,
  faCircleInfo,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import Avatar from "@/app/components/Avatar";

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

async function loadDashboard() {
  const supabase = getSupabaseAdmin();

  const [usersRes, attemptsRes, predictionsRes, roomsRes, roomAssignRes, activityRes] =
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
      supabase.from("rooms").select("id, name, capacity, status").order("name"),
      supabase.from("room_assignments").select("room_id"),
      supabase
        .from("audit_logs")
        .select("action, created_at, actor:users(name)")
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

  const users = usersRes.data ?? [];
  const attempts = attemptsRes.data ?? [];
  const rooms = roomsRes.data ?? [];

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
  const scoredStudents = [...totals.values()].filter((t) => t.count > 0);
  const averageScore =
    attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.score ?? 0), 0) / attempts.length)
      : null;

  // Latest prediction per student (rows arrive newest-first).
  const latestRisk = new Map<string, string>();
  for (const p of predictionsRes.data ?? []) {
    if (!latestRisk.has(p.student_id)) latestRisk.set(p.student_id, p.risk);
  }
  const atRiskIds = students.filter((s) => latestRisk.get(s.id) === "at_risk").map((s) => s.id);
  const atRiskStudents: AtRiskRow[] = students
    .filter((s) => atRiskIds.includes(s.id))
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

  const occupancy = new Map<string, number>();
  for (const ra of roomAssignRes.data ?? []) {
    occupancy.set(ra.room_id, (occupancy.get(ra.room_id) ?? 0) + 1);
  }

  return {
    totalStudents: students.length,
    facultyCount,
    totalUsers: users.length,
    averageScore,
    totalQuizzes: attempts.length,
    scoredStudentCount: scoredStudents.length,
    atRiskStudents,
    weeklyAttempts,
    rooms: rooms.map((r) => ({ ...r, students_assigned: occupancy.get(r.id) ?? 0 })),
    activity: (activityRes.data ?? []) as unknown as ActivityRow[],
  };
}

export default async function AdminDashboard() {
  const data = await loadDashboard();
  const {
    totalStudents,
    facultyCount,
    totalUsers,
    averageScore,
    totalQuizzes,
    atRiskStudents,
    weeklyAttempts,
    rooms,
    activity,
  } = data;

  const maxWeekly = Math.max(...weeklyAttempts, 1);
  const safeCount = totalStudents - atRiskStudents.length;

  return (
    <div>
      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-brand-600 rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />
              Admin Dashboard
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back, Dean</h1>
            <p className="text-gray-500 mt-1">
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} • Here&apos;s what&apos;s happening today
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-brand-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{totalStudents}</p>
          <p className="text-gray-500 text-sm">Total Students</p>
          <p className="mt-4 text-xs text-gray-400">{facultyCount} faculty · {totalUsers} accounts overall</p>
        </div>

        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-6 h-6 text-brand-600" />
            </div>
            {atRiskStudents.length > 0 && (
              <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-medium">Needs attention</span>
            )}
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{atRiskStudents.length}</p>
          <p className="text-gray-500 text-sm">Students at Risk</p>
          <p className="mt-4 text-xs text-gray-400">
            {atRiskStudents.length === 0
              ? "No ML at-risk flags on record"
              : "Flagged by the latest ML prediction run"}
          </p>
        </div>

        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faCircleCheck} className="w-6 h-6 text-brand-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{averageScore !== null ? `${averageScore}%` : "—"}</p>
          <p className="text-gray-500 text-sm">Average Score</p>
          <div className="mt-4">
            {averageScore !== null ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Passing threshold: 75%</span>
                  <span className={`text-xs font-medium ${averageScore >= 75 ? "text-emerald-600" : "text-rose-600"}`}>
                    {averageScore >= 75 ? "Above threshold" : "Below threshold"}
                  </span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-600 to-[#2a8a98] rounded-full" style={{ width: `${Math.min(averageScore, 100)}%` }} />
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">No submitted attempts yet</p>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faClipboardCheck} className="w-6 h-6 text-brand-600" />
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-800 mb-1">{totalQuizzes}</p>
          <p className="text-gray-500 text-sm">Quizzes Completed</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Submitted per week (last 5)</p>
            <div className="flex items-end gap-1 h-8">
              {weeklyAttempts.map((v, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t flex items-end">
                  <div className="w-full bg-brand-600 rounded-t" style={{ height: `${(v / maxWeekly) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-2 lg:col-span-2 bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Room Capacity</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Occupancy</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Current student occupancy per room</p>
          {rooms.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No rooms yet — create them in <Link href="/admin/rooms" className="text-brand-600 hover:underline">Rooms</Link>.
            </p>
          ) : (
            <div className="space-y-4">
              {rooms.slice(0, 6).map((room) => {
                const percentage = room.capacity > 0 ? (room.students_assigned / room.capacity) * 100 : 0;
                const isFull = percentage >= 90;
                return (
                  <div key={room.id}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {room.name}
                        {room.status !== "active" && <span className="text-gray-400 text-xs"> · {room.status}</span>}
                      </span>
                      <span className={`text-sm font-medium ${isFull ? "text-rose-600" : "text-gray-500"}`}>
                        {room.students_assigned}/{room.capacity}
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-rose-500" : "bg-gradient-to-r from-brand-600 to-[#2a8a98]"}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="space-y-3">
            <Link href="/admin/student-management" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-600/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:bg-brand-600 transition-all">
                <FontAwesomeIcon icon={faUserPlus} className="w-4 h-4 text-brand-600 group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">Enroll Student</span>
            </Link>
            <Link href="/admin/reports" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-600/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:bg-brand-600 transition-all">
                <FontAwesomeIcon icon={faFileLines} className="w-4 h-4 text-brand-600 group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">Generate Report</span>
            </Link>
            <Link href="/admin/analytics" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-600/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:bg-brand-600 transition-all">
                <FontAwesomeIcon icon={faChartColumn} className="w-4 h-4 text-brand-600 group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">View Analytics</span>
            </Link>
            <Link href="/admin/rooms" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-600/5 transition-colors text-left group">
              <div className="w-8 h-8 bg-brand-600/10 rounded-lg flex items-center justify-center group-hover:bg-brand-600 transition-all">
                <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-brand-600 group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">Manage Rooms</span>
            </Link>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 md:p-6 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <Link href="/admin/audit" className="text-xs text-brand-600 hover:underline">Audit trail</Link>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No recorded activity yet</p>
          ) : (
            <div className="space-y-4">
              {activity.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-brand-600/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <FontAwesomeIcon icon={faCircleInfo} className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{entry.actor?.name ?? "System"}</span>{" "}
                      <span className="capitalize">{humanizeAction(entry.action)}</span>
                    </p>
                    <p className="text-xs text-gray-500">{relativeTime(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/admin/rooms">
          <div className="bg-surface rounded-xl p-5 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-600/10 group-hover:scale-110 transition-transform duration-300">
                <FontAwesomeIcon icon={faBuilding} className="w-6 h-6 text-brand-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{rooms.filter((r) => r.status === "active").length}</p>
                <p className="text-sm text-gray-500 font-medium">Active Rooms</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/faculty">
          <div className="bg-surface rounded-xl p-5 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-600/10 group-hover:scale-110 transition-transform duration-300">
                <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-brand-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{facultyCount}</p>
                <p className="text-sm text-gray-500 font-medium">Faculty</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/users">
          <div className="bg-surface rounded-xl p-5 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-600/10 group-hover:scale-110 transition-transform duration-300">
                <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-brand-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{totalUsers}</p>
                <p className="text-sm text-gray-500 font-medium">User Accounts</p>
              </div>
            </div>
          </div>
        </Link>
        <Link href="/admin/analytics">
          <div className="bg-surface rounded-xl p-5 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-600/10 group-hover:scale-110 transition-transform duration-300">
                <FontAwesomeIcon icon={faChartColumn} className="w-6 h-6 text-brand-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">
                  {safeCount}/{totalStudents}
                </p>
                <p className="text-sm text-gray-500 font-medium">Students on Track</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {atRiskStudents.length > 0 && (
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Students Requiring Attention</h3>
                <p className="text-sm text-gray-500">{atRiskStudents.length} flagged by ML prediction</p>
              </div>
            </div>
            <Link
              href="/admin/student-management"
              className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors"
            >
              View All
              <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {atRiskStudents.map((student) => (
              <Link
                key={student.id}
                href={`/admin/students/${student.id}`}
                className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Avatar name={student.name} src={student.picture_url} size="lg" tone="risk" />
                  <div>
                    <p className="font-semibold text-gray-800">{student.name}</p>
                    <p className="text-sm text-gray-500">{student.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-rose-600 text-lg">
                      {student.average_score !== null ? `${student.average_score}%` : "—"}
                    </p>
                    <p className="text-sm text-gray-500">{student.quizzes_completed} quizzes</p>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
