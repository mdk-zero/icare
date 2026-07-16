"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartBar,
  faUsers,
  faClipboardCheck,
  faHeartbeat,
  faExclamationTriangle,
  faNotesMedical,
} from "@fortawesome/free-solid-svg-icons";
import { fetchAnalyticsSummary, AnalyticsSummary } from "../../lib/api";
import { SkeletonStatCard, SkeletonChartArea, SkeletonCompetencyGrid } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";
import StatTile from "../../components/StatTile";

export default function FacultyAnalyticsClient() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setSummary(await fetchAnalyticsSummary());
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-96 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChartArea />
          <SkeletonChartArea />
        </div>
        <SkeletonCompetencyGrid />
      </div>
    );
  }

  const atRisk = summary?.risk_distribution?.at_risk ?? 0;
  const safe = summary?.risk_distribution?.safe ?? 0;
  const predicted = atRisk + safe;
  const trend = summary?.weekly_trend ?? [];
  const maxAttempts = Math.max(1, ...trend.map((w) => w.attempts));
  const activity = summary?.clinical_activity;

  const statCards = [
    {
      icon: faChartBar,
      value: summary?.cohort.average_score != null ? `${summary.cohort.average_score}%` : "—",
      label: "Cohort Average Score",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: faClipboardCheck,
      value: `${summary?.cohort.submitted_attempts ?? 0}`,
      label: "Submitted Quiz Attempts",
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      icon: faUsers,
      value: `${summary?.cohort.active_students_30d ?? 0}/${summary?.cohort.total_students ?? 0}`,
      label: "Active Students (30 days)",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      icon: faExclamationTriangle,
      value: `${atRisk}`,
      label: "At-Risk Students",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
  ];

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
          label: "Warehouse Analytics",
        }}
        title="Cohort Analytics"
        subtitle="Performance and clinical training data from the iCARE++ warehouse"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {statCards.map((card) => (
          <StatTile
            key={card.label}
            icon={<FontAwesomeIcon icon={card.icon} className="w-5 h-5" />}
            value={card.value}
            label={card.label}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Score Trend</h3>
          {trend.length === 0 ? (
            <p className="text-gray-400 text-sm py-12 text-center">
              No submitted attempts in the last 8 weeks.
            </p>
          ) : (
            <>
              <div className="h-40 flex items-end justify-between gap-2 px-2">
                {trend.map((week) => (
                  <div key={week.week_start} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B6B7B] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {week.average_score}% · {week.attempts} attempt{week.attempts === 1 ? "" : "s"}
                      </div>
                      <div
                        className="w-full bg-gradient-to-t from-[#1B6B7B] to-[#2a8a98] rounded-t transition-all duration-300 hover:opacity-80"
                        style={{ height: `${Math.max(week.average_score, 4) * 1.4}px` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 px-2">
                {trend.map((week) => (
                  <span key={week.week_start} className="text-[10px] text-gray-400">
                    {new Date(week.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card padding="md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">At-Risk Prediction Snapshot</h3>
          {predicted === 0 ? (
            <div className="py-10 text-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">
                No predictions yet — the ML prediction service (Random Forest / Logistic
                Regression) populates this once deployed.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Safe</span>
                <span className="font-bold text-emerald-600">{safe}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${(safe / predicted) * 100}%` }} />
                <div className="bg-rose-500 h-full" style={{ width: `${(atRisk / predicted) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">At risk</span>
                <span className="font-bold text-rose-600">{atRisk}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card padding="md" className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Competency Breakdown</h3>
        {Object.keys(summary?.competency_breakdown ?? {}).length === 0 ? (
          <p className="text-gray-400 text-sm">
            No validated competency scores yet — record them from each student&apos;s profile.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(summary!.competency_breakdown).map(([name, value]) => (
              <div key={name} className="text-center">
                <div className="relative w-20 h-20 mx-auto">
                  <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      fill="none"
                      stroke="#1B6B7B"
                      strokeWidth="8"
                      strokeDasharray={`${(value / 100) * 201} 201`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-semibold text-gray-800">{value}%</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">{name}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinical Training Activity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { icon: faHeartbeat, label: "Vital Readings", value: activity?.vital_readings ?? 0 },
            { icon: faExclamationTriangle, label: "Anomalies Flagged", value: activity?.anomalies ?? 0 },
            { icon: faNotesMedical, label: "TPR Entries", value: activity?.tpr_entries ?? 0 },
            { icon: faNotesMedical, label: "IVF Records", value: activity?.ivf_records ?? 0 },
            { icon: faNotesMedical, label: "Progress Notes", value: activity?.progress_notes ?? 0 },
            { icon: faClipboardCheck, label: "Notes Reviewed", value: activity?.notes_reviewed ?? 0 },
          ].map((item) => (
            <div key={item.label} className="p-4 bg-gray-50 rounded-xl text-center">
              <FontAwesomeIcon icon={item.icon} className="w-4 h-4 text-[#1B6B7B] mb-2" />
              <p className="text-2xl font-bold text-gray-800">{item.value}</p>
              <p className="text-xs text-gray-500 mt-1">{item.label}</p>
            </div>
          ))}
        </div>
        {summary?.etl?.last_run_at && (
          <p className="text-xs text-gray-400 mt-4">
            Warehouse last refreshed {new Date(summary.etl.last_run_at).toLocaleString()}
          </p>
        )}
      </Card>
    </div>
  );
}
