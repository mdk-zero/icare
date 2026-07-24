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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Weekly Quiz Performance</h3>
              {trend.length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">
                  No submitted attempts in the last 8 weeks.
                </p>
              ) : (
                <>
                  <div className="h-48 flex items-end justify-between gap-3 px-2">
                    {trend.map((week) => (
                      <div key={week.week_start} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full relative">
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {week.average_score}% · {week.attempts} attempt{week.attempts === 1 ? "" : "s"}
                          </div>
                          <div
                            className="w-full bg-gradient-to-t from-brand-600 to-[#2a8a98] rounded-t-lg transition-all duration-500 hover:opacity-80"
                            style={{ height: `${Math.max(week.average_score, 4) * 1.7}px` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(week.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-hairline">
                    <div>
                      <p className="text-2xl font-bold text-gray-800">
                        {summary?.cohort.submitted_attempts ?? 0}
                      </p>
                      <p className="text-sm text-gray-500">Total Submitted Attempts</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-brand-600">
                        {summary?.cohort.active_students_30d ?? 0}
                      </p>
                      <p className="text-sm text-gray-500">active students (30d)</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Room Utilization</h3>
              {(summary?.room_utilization ?? []).length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">
                  No rooms configured yet — add them under Rooms.
                </p>
              ) : (
                <div className="space-y-4">
                  {summary!.room_utilization.map((room) => (
                    <div
                      key={room.room_number}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-800">
                            {room.name} · Room {room.room_number}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
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
                          <span className="text-sm font-bold text-gray-800 w-10">
                            {room.utilization_pct}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {room.assigned}/{room.capacity}
                        </p>
                        <p className="text-xs text-gray-400">students</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinical Training Activity</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: faHeartbeat, label: "Vital Readings", value: activity?.vital_readings ?? 0 },
                { icon: faExclamationTriangle, label: "Anomalies Flagged", value: activity?.anomalies ?? 0 },
                { icon: faNotesMedical, label: "TPR Entries", value: activity?.tpr_entries ?? 0 },
                { icon: faNotesMedical, label: "IVF Records", value: activity?.ivf_records ?? 0 },
                { icon: faNotesMedical, label: "Progress Notes", value: activity?.progress_notes ?? 0 },
                { icon: faClipboardCheck, label: "Notes Reviewed", value: activity?.notes_reviewed ?? 0 },
              ].map((item) => (
                <div key={item.label} className="p-3 bg-gray-50 rounded-lg text-center">
                  <FontAwesomeIcon icon={item.icon} className="w-4 h-4 text-brand-600 mb-2" />
                  <p className="text-2xl font-bold text-gray-800">{item.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

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
