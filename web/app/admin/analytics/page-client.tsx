"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartBar,
  faUsers,
  faDoorOpen,
  faExclamationTriangle,
  faSpinner,
  faRotate,
  faBrain,
  faHeartbeat,
  faNotesMedical,
  faClipboardCheck,
  faCircleCheck,
  faGraduationCap,
} from "@fortawesome/free-solid-svg-icons";
import { fetchAnalyticsSummary, runWarehouseEtl, runMlJob, AnalyticsSummary } from "../../lib/api";

export default function AdminAnalyticsClient() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningMl, setRunningMl] = useState(false);
  const [mlStatus, setMlStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { summary } = await fetchAnalyticsSummary();
    setSummary(summary);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setError(null);
    setRefreshing(true);
    const result = await runWarehouseEtl();
    if (result.error) {
      setError(result.error);
    } else {
      await load();
    }
    setRefreshing(false);
  };

  const handleRunMl = async () => {
    setError(null);
    setMlStatus(null);
    setRunningMl(true);
    const predictions = await runMlJob("predict");
    if (predictions.error) {
      setError(predictions.error);
      setRunningMl(false);
      return;
    }
    const recommendations = await runMlJob("recommend");
    if (recommendations.error) {
      setError(recommendations.error);
      setRunningMl(false);
      return;
    }
    const scored = predictions.result?.scored ?? 0;
    const atRiskNow = predictions.result?.at_risk ?? 0;
    const recs = recommendations.result?.recommendations ?? 0;
    setMlStatus(
      `Scored ${scored} students (${atRiskNow} at risk) and wrote ${recs} recommendations. ` +
        "Run Refresh Warehouse to fold new predictions into these charts.",
    );
    setRunningMl(false);
  };

  const atRisk = summary?.risk_distribution?.at_risk ?? 0;
  const activeRooms = (summary?.room_utilization ?? []).filter((r) => r.status === "active").length;
  const trend = summary?.weekly_trend ?? [];
  const activity = summary?.clinical_activity;

  return (
    <div>
      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-brand-600 rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <FontAwesomeIcon icon={faChartBar} className="w-3.5 h-3.5" />
              Analytics
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">
              Cohort analytics from the iCARE++ star-schema warehouse
              {summary?.etl?.last_run_at &&
                ` · last refreshed ${new Date(summary.etl.last_run_at).toLocaleString()}`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleRunMl}
              disabled={runningMl}
              className="px-4 py-2 bg-surface text-brand-600 font-medium rounded-lg border border-brand-600/30 hover:bg-brand-600/5 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={runningMl ? faSpinner : faBrain} spin={runningMl} className="w-4 h-4" />
              {runningMl ? "Running…" : "Run ML Jobs"}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-all duration-200 flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)] disabled:opacity-50"
            >
              <FontAwesomeIcon icon={refreshing ? faSpinner : faRotate} spin={refreshing} className="w-4 h-4" />
              {refreshing ? "Refreshing…" : "Refresh Warehouse"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            {error}
          </div>
        )}
        {mlStatus && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
            {mlStatus}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <FontAwesomeIcon icon={faSpinner} spin className="w-8 h-8 text-brand-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { icon: faUsers, label: "Total Students", value: `${summary?.cohort.total_students ?? 0}` },
              { icon: faExclamationTriangle, label: "At-Risk Students", value: `${atRisk}` },
              { icon: faDoorOpen, label: "Active Rooms", value: `${activeRooms}` },
              {
                icon: faChartBar,
                label: "Avg. Quiz Score",
                value: summary?.cohort.average_score != null ? `${summary.cohort.average_score}%` : "—",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-surface p-5 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200"
              >
                <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center mb-4">
                  <FontAwesomeIcon icon={stat.icon} className="w-5 h-5 text-brand-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Second row: Quiz Performance (spans 2 cols on lg) + Room Utilization */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Quiz Performance</h3>
              {trend.length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">
                  No submitted attempts in the last 8 weeks.
                </p>
              ) : (
                <>
                  <div className="h-48 flex items-end justify-between gap-2 sm:gap-3 px-2">
                    {trend.map((week) => (
                      <div key={week.week_start} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full relative">
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                            {week.average_score}% · {week.attempts} attempt{week.attempts === 1 ? "" : "s"}
                          </div>
                          <div
                            className="w-full bg-gradient-to-t from-brand-600 to-[#2a8a98] rounded-t-lg transition-all duration-500 hover:opacity-80"
                            style={{ height: `${Math.max(week.average_score, 4) * 2.2}px` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(week.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-hairline">
                    <div>
                      <p className="text-2xl font-bold text-gray-800">
                        {summary?.cohort.submitted_attempts ?? 0}
                      </p>
                      <p className="text-sm text-gray-500">Total Attempts</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-brand-600">
                        {summary?.cohort.active_students_30d ?? 0}
                      </p>
                      <p className="text-sm text-gray-500">Active (30d)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">
                        {trend.length > 0
                          ? `${Math.round(trend.reduce((s, w) => s + w.average_score, 0) / trend.length)}%`
                          : "—"}
                      </p>
                      <p className="text-sm text-gray-500">8-Week Avg</p>
                    </div>
                  </div>

                  {/* Weekly Breakdown mini-table */}
                  <div className="mt-4 pt-3 border-t border-hairline">
                    <div className="flex items-center gap-2 mb-3">
                      <FontAwesomeIcon icon={faChartBar} className="w-4 h-4 text-brand-600" />
                      <h4 className="text-sm font-semibold text-gray-700">Weekly Breakdown</h4>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(() => {
                        const sorted = [...trend].sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
                        const best = sorted.reduce((max, w) => w.average_score > max.average_score ? w : max, sorted[0]);
                        const worst = sorted.reduce((min, w) => w.average_score < min.average_score ? w : min, sorted[0]);
                        const totalAttempts = sorted.reduce((s, w) => s + w.attempts, 0);
                        const avgAttempts = Math.round(totalAttempts / sorted.length);
                        const trendDir = sorted.length > 1
                          ? sorted[0].average_score > sorted[sorted.length - 1].average_score
                            ? "Improving"
                            : sorted[0].average_score < sorted[sorted.length - 1].average_score
                              ? "Declining"
                              : "Stable"
                          : "—";
                        return [
                          { label: "Best Week", value: `${best.average_score}%`, sub: new Date(best.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) },
                          { label: "Lowest Week", value: `${worst.average_score}%`, sub: new Date(worst.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) },
                          { label: "Avg Attempts/Week", value: `${avgAttempts}`, sub: `${sorted.length} weeks` },
                          { label: "Trend", value: trendDir, sub: trendDir === "Improving" ? "↑" : trendDir === "Declining" ? "↓" : "→" },
                        ].map((item) => (
                          <div key={item.label} className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
                            <p className={`text-lg font-bold ${
                              item.label === "Trend" && item.value === "Improving" ? "text-emerald-600" :
                              item.label === "Trend" && item.value === "Declining" ? "text-rose-600" :
                              "text-gray-800"
                            }`}>{item.value}</p>
                            <p className="text-xs text-gray-400">{item.sub}</p>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                </>
              )}
            </div>

            <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Room Utilization</h3>
              {(summary?.room_utilization ?? []).length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">No rooms configured yet.</p>
              ) : (
                <div className="space-y-4 flex-1">
                  {summary!.room_utilization.map((room) => (
                    <div
                      key={room.room_number}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {room.name}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                              room.status === "active"
                                ? "bg-green-100 text-green-700"
                                : room.status === "maintenance"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-200 text-gray-500"
                            }`}
                          >
                            {room.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand-600 to-[#2a8a98] rounded-full"
                              style={{ width: `${Math.min(room.utilization_pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-gray-800 w-10 shrink-0">
                            {room.utilization_pct}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">
                          {room.assigned}/{room.capacity}
                        </p>
                        <p className="text-xs text-gray-400">students</p>
                      </div>
                    </div>
                  ))}
                  {/* Risk Summary at bottom of Room Utilization card */}
                  {(summary?.risk_distribution?.at_risk ?? 0) > 0 && (
                    <div className="mt-auto pt-4 border-t border-hairline">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Summary</h4>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="flex h-full">
                            <div
                              className="bg-emerald-500 h-full transition-all"
                              style={{
                                width: `${summary?.risk_distribution ? Math.round(
                                  ((summary.risk_distribution.safe ?? 0) /
                                    ((summary.risk_distribution.safe ?? 0) + (summary.risk_distribution.at_risk ?? 0))) * 100
                                ) : 0}%`,
                              }}
                            />
                            <div
                              className="bg-rose-400 h-full transition-all"
                              style={{
                                width: `${summary?.risk_distribution ? Math.round(
                                  ((summary.risk_distribution.at_risk ?? 0) /
                                    ((summary.risk_distribution.safe ?? 0) + (summary.risk_distribution.at_risk ?? 0))) * 100
                                ) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            {summary?.risk_distribution?.safe ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            {summary?.risk_distribution?.at_risk ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Third row: Clinical Activity + Section Performance split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-5">Clinical Training Activity</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { icon: faHeartbeat, label: "Vital Readings", value: activity?.vital_readings ?? 0, color: "text-rose-600", bg: "bg-rose-50" },
                  { icon: faExclamationTriangle, label: "Anomalies", value: activity?.anomalies ?? 0, color: "text-amber-600", bg: "bg-amber-50" },
                  { icon: faNotesMedical, label: "TPR Entries", value: activity?.tpr_entries ?? 0, color: "text-blue-600", bg: "bg-blue-50" },
                  { icon: faNotesMedical, label: "IVF Records", value: activity?.ivf_records ?? 0, color: "text-purple-600", bg: "bg-purple-50" },
                  { icon: faNotesMedical, label: "Progress Notes", value: activity?.progress_notes ?? 0, color: "text-cyan-600", bg: "bg-cyan-50" },
                  { icon: faClipboardCheck, label: "Notes Reviewed", value: activity?.notes_reviewed ?? 0, color: "text-emerald-600", bg: "bg-emerald-50" },
                ].map((item) => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-4`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.bg} border border-white/50`}>
                        <FontAwesomeIcon icon={item.icon} className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-gray-800">{item.value}</p>
                        <p className="text-xs text-gray-500">{item.label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section Performance */}
            <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-5">
                <FontAwesomeIcon icon={faGraduationCap} className="w-4 h-4 text-brand-600 mr-2" />
                Section Summary
              </h3>
              {(summary?.sections ?? []).length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">No sections configured.</p>
              ) : (
                <div className="space-y-3">
                  {summary!.sections.map((sec) => (
                    <div key={sec.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-800 truncate">{sec.name}</span>
                      <span className="flex items-center gap-1.5 text-sm text-gray-600 shrink-0 ml-3">
                        <FontAwesomeIcon icon={faUsers} className="w-3 h-3 text-gray-400" />
                        {sec.students}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {summary?.cohort.average_score != null && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Overall Average</span>
                    <span className="text-sm font-bold text-brand-600">{summary.cohort.average_score}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-[#2a8a98] rounded-full"
                      style={{ width: `${Math.min(summary.cohort.average_score, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Competency Performance Ranking */}
          {(summary?.competency_detail ?? []).length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
                <h3 className="text-lg font-semibold text-gray-900 mb-5">Competency Performance</h3>
                <div className="space-y-3">
                  {[...summary!.competency_detail]
                    .sort((a, b) => b.average_score - a.average_score)
                    .map((comp, i) => (
                      <div key={comp.name} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          i === 0 ? "bg-amber-100 text-amber-700" :
                          i === 1 ? "bg-gray-100 text-gray-600" :
                          i === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-gray-50 text-gray-500"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-800 truncate">{comp.name}</span>
                            <span className="text-sm font-bold text-gray-700 ml-2 shrink-0">{comp.average_score}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                comp.average_score >= 80 ? "bg-emerald-500" :
                                comp.average_score >= 60 ? "bg-brand-600" :
                                "bg-rose-400"
                              }`}
                              style={{ width: `${Math.min(comp.average_score, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs text-gray-500">{comp.students} students</p>
                          <p className="text-xs text-gray-400">{comp.ratings} ratings</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Completion Overview */}
              <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
                <h3 className="text-lg font-semibold text-gray-900 mb-5">Completion Overview</h3>
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-center flex-1">
                    <div className="text-center">
                      <div className="relative w-40 h-40 mx-auto mb-4">
                        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                          <circle
                            cx="60" cy="60" r="54" fill="none"
                            stroke="url(#completionGradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.min(
                              ((summary?.cohort.submitted_attempts ?? 0) /
                                Math.max(summary?.cohort.total_students ?? 1, 1)) * 339.292,
                              339.292
                            )} 339.292`}
                          />
                          <defs>
                            <linearGradient id="completionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#155663" />
                              <stop offset="100%" stopColor="#2a8a98" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-3xl font-bold text-gray-900">
                            {summary?.cohort.total_students ?? 0}
                          </p>
                          <p className="text-xs text-gray-500">Students</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-emerald-50 rounded-lg">
                          <p className="text-lg font-bold text-emerald-700">{summary?.cohort.submitted_attempts ?? 0}</p>
                          <p className="text-xs text-emerald-600">Attempts</p>
                        </div>
                        <div className="p-3 bg-brand-50 rounded-lg">
                          <p className="text-lg font-bold text-brand-700">{summary?.cohort.active_students_30d ?? 0}</p>
                          <p className="text-xs text-brand-600">Active</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="p-6 border-b border-hairline">
              <h3 className="text-lg font-semibold text-gray-900">Competency Assessment Summary</h3>
              <p className="text-sm text-gray-500">
                Faculty-validated competency scores across the cohort (pass mark: 75%)
              </p>
            </div>
            {(summary?.competency_detail ?? []).length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center">
                No validated competency scores yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Competency</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Students Assessed</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Ratings</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Average Score</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary!.competency_detail.map((row) => (
                      <tr key={row.name} className="border-t border-hairline hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-800 font-medium">{row.name}</td>
                        <td className="py-3 px-4 text-gray-600">{row.students}</td>
                        <td className="py-3 px-4 text-gray-600">{row.ratings}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-600 rounded-full"
                                style={{ width: `${Math.min(row.average_score, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-800">{row.average_score}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              row.pass_rate_pct >= 90
                                ? "bg-emerald-50 text-emerald-700"
                                : row.pass_rate_pct >= 80
                                  ? "bg-brand-600/10 text-brand-600"
                                  : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {row.pass_rate_pct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
