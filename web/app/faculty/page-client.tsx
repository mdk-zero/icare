"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  fetchFacultyDashboard,
  fetchFacultyAlerts,
  fetchFacultyStudents,
  refreshCurrentUser,
  FacultyStats,
  FacultyAlert,
  AuditLog,
  FacultyStudent
} from "../lib/api";
import {
  SkeletonStatCard,
  SkeletonStudentRow,
  SkeletonActivityItem,
} from "../components/skeletons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse, faUsers, faTriangleExclamation, faBell, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import Avatar from "../components/Avatar";

/**
 * Keyed by the risk_level enum the ML service actually writes
 * (public.risk_level = 'safe' | 'at_risk'); `default` covers students the
 * model has never scored.
 */
const RISK_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  at_risk: {
    bar: "bg-red-500",
    badge: "bg-red-100 text-red-700 border-red-200",
    label: "At risk",
  },
  safe: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    label: "On track",
  },
  default: {
    bar: "bg-gray-300",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    label: "No prediction",
  },
};

/** "3h ago" for anything recent, an absolute date once it stops being useful. */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "No activity yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FacultyDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<FacultyStats | null>(null);
  const [students, setStudents] = useState<FacultyStudent[]>([]);
  const [alerts, setAlerts] = useState<FacultyAlert[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      const [dashboardData, alertsData, studentsData, user] = await Promise.all([
        fetchFacultyDashboard(),
        fetchFacultyAlerts(),
        fetchFacultyStudents(),
        refreshCurrentUser(),
      ]);

      if (dashboardData) {
        setStats(dashboardData.stats);
        setActivities(dashboardData.recent_activities);
      }

      if (alertsData) {
        // The table shows the newest few; the badge must still count them all.
        setAlerts(alertsData.alerts.slice(0, 5));
        setPendingAlerts(alertsData.pending);
      }

      if (studentsData) {
        setStudents(studentsData.slice(0, 5));
      }

      if (user?.name) {
        setFirstName(user.name.split(" ")[0]);
      }

      setLoading(false);
    };

    loadDashboardData();
  }, []);

  const getRisk = (risk?: string | null) => RISK_STYLES[risk ?? "default"] ?? RISK_STYLES.default;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-amber-600 bg-amber-50';
      case 'low': return 'text-emerald-600 bg-emerald-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getActivityMeta = (type: string) => {
    if (type.toLowerCase().includes('alert')) {
      return {
        path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        dot: 'bg-red-500',
        ring: 'ring-red-100',
      };
    } else if (type.toLowerCase().includes('scenario')) {
      return {
        path: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.414 1.414.586 3.414-1.414 3.414H12m8 0h2a2 2 0 002-2v-4a2 2 0 00-2-2h-2',
        dot: 'bg-brand-600',
        ring: 'ring-teal-100',
      };
    }
    return {
      path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
      dot: 'bg-emerald-500',
      ring: 'ring-emerald-100',
    };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-72 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse">
            <div className="p-3 border-b border-gray-100">
              <div className="h-5 w-28 bg-gray-200 rounded" />
              <div className="h-4 w-44 bg-gray-200 rounded mt-1" />
            </div>
            <div className="divide-y divide-hairline">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonStudentRow key={i} />
              ))}
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse">
            <div className="p-3 border-b border-gray-100">
              <div className="h-5 w-32 bg-gray-200 rounded" />
              <div className="h-4 w-44 bg-gray-200 rounded mt-1" />
            </div>
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonActivityItem key={i} />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse">
          <div className="p-3 border-b border-gray-100">
            <div className="h-5 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-44 bg-gray-200 rounded mt-1" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <th key={i} className="px-5 py-3">
                      <div className="h-3 w-16 bg-gray-200 rounded" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className={`h-4 ${["w-24", "w-20", "w-16", "w-20", "w-16", "w-12"][j]} bg-gray-200 rounded`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const total = stats?.total_students ?? 0;
  const atRisk = stats?.at_risk_students ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />,
          label: "Dashboard",
        }}
        title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
        subtitle="Here's what's happening with your students today."
        action={{
          icon: <FontAwesomeIcon icon={faUsers} className="w-6 h-6" />,
          onClick: () => router.push('/faculty/students'),
          label: "View Students",
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faUsers} className="w-5 h-5" />}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
          value={total}
          label="Total Students"
          caption="Enrolled under you"
          onClick={() => router.push('/faculty/students')}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          value={atRisk}
          label="At-Risk Students"
          caption={total > 0 ? `${Math.round((atRisk / total) * 100)}% of total` : "No students yet"}
          onClick={() => router.push('/faculty/students')}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faBell} className="w-5 h-5" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          value={stats?.active_alerts ?? 0}
          label="Active Alerts"
          caption="Awaiting your review"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          value={stats?.active_scenarios ?? 0}
          label="Active Scenarios"
          caption="Currently in progress"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My Students</h2>
              <p className="text-sm text-gray-500 mt-0.5">Students under your supervision</p>
            </div>
            <button 
              onClick={() => router.push('/faculty/students')}
              className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              View All →
            </button>
          </div>
          <div className="divide-y divide-hairline">
            {students.map((student) => {
              const risk = getRisk(student.risk_level);
              return (
                <div
                  key={student.id}
                  className="relative flex items-center gap-3 p-4 pl-5 hover:bg-subtle transition-colors cursor-pointer"
                  onClick={() => router.push(`/faculty/students/${student.id}`)}
                >
                  <span className={`absolute left-0 top-0 h-full w-1 ${risk.bar}`} aria-hidden />
                  <Avatar name={student.name} src={student.picture_url} size="md" tone="solid" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{student.name}</p>
                    <p className="text-sm text-gray-500 truncate">{student.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${risk.badge}`}>
                      {risk.label}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(student.last_activity)}</span>
                  </div>
                </div>
              );
            })}
            {students.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-gray-500 font-medium">No students assigned yet</p>
                <p className="text-sm text-gray-400 mt-1">Students you supervise will show up here.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <p className="text-sm text-gray-500 mt-0.5">Latest updates and actions</p>
          </div>
          <div className="p-4">
            <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
              {activities.slice(0, 4).map((activity) => {
                const meta = getActivityMeta(activity.action);
                return (
                  <li key={activity.id} className="relative flex gap-3">
                    <span className={`relative z-10 w-8 h-8 shrink-0 rounded-full bg-surface ring-4 ${meta.ring} flex items-center justify-center`}>
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    </span>
                    <div className="flex-1 min-w-0 pb-0.5">
                      <p className="font-medium text-gray-900 text-sm">{activity.action}</p>
                      <p className="text-xs text-gray-500 truncate">{activity.details}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(activity.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {activities.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pending Alerts</h2>
            <p className="text-sm text-gray-500 mt-0.5">Alerts requiring your attention</p>
          </div>
          {pendingAlerts > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
              {pendingAlerts} pending
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Alert Type</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Severity</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-subtle transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{alert.student_name}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-gray-600">{alert.alert_type}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                      {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-gray-500 text-sm">{timeAgo(alert.created_at)}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      alert.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      alert.status === 'reviewed' ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => router.push(`/faculty/students/${alert.student_id}`)}
                      className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <p className="text-gray-500 font-medium">No pending alerts</p>
                    <p className="text-sm text-gray-400 mt-1">You&apos;re all caught up.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}