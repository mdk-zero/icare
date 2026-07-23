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
  faDroplet,
  faTemperatureHalf,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { fetchAnalyticsSummary, AnalyticsSummary } from "../../lib/api";
import { SkeletonStatCard, SkeletonChartArea, SkeletonCompetencyGrid } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";
import StatTile from "../../components/StatTile";

const BRAND = "#1B6B7B";

/** Score trend over time — a line + area chart, the correct shape for a series. */
function TrendLineChart({
  data,
}: {
  data: { week_start: string; average_score: number; attempts: number }[];
}) {
  const W = 600;
  const H = 190;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;
  const line = data.map((d, i) => `${x(i)},${y(d.average_score)}`).join(" ");
  const area =
    n > 0
      ? `M ${x(0)},${y(0)} ` +
        data.map((d, i) => `L ${x(i)},${y(d.average_score)}`).join(" ") +
        ` L ${x(n - 1)},${y(0)} Z`
      : "";
  const grid = [0, 25, 50, 75, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity="0.22" />
            <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#eef2f6" strokeWidth="1" />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
              {g}
            </text>
          </g>
        ))}
        {n > 1 && <path d={area} fill="url(#trendArea)" />}
        {n > 1 && (
          <polyline
            points={line}
            fill="none"
            stroke={BRAND}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {data.map((d, i) => (
          <circle
            key={d.week_start}
            cx={x(i)}
            cy={y(d.average_score)}
            r="3.5"
            fill="#fff"
            stroke={BRAND}
            strokeWidth="2"
          >
            <title>{`${d.average_score}% · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        {data.map((week) => (
          <span key={week.week_start} className="text-[10px] text-gray-400">
            {new Date(week.week_start).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Safe vs at-risk split — a donut, the correct shape for a part-to-whole. */
function RiskDonut({ safe, atRisk }: { safe: number; atRisk: number }) {
  const total = safe + atRisk;
  const r = 54;
  const cx = 70;
  const cy = 70;
  const sw = 16;
  const c = 2 * Math.PI * r;
  const safeLen = total ? (safe / total) * c : 0;
  const atRiskLen = total ? (atRisk / total) * c : 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-[140px] h-[140px]">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
          {safeLen > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#10b981"
              strokeWidth={sw}
              strokeDasharray={`${safeLen} ${c}`}
            />
          )}
          {atRiskLen > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={sw}
              strokeDasharray={`${atRiskLen} ${c}`}
              strokeDashoffset={-safeLen}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-[11px] text-gray-500">predicted</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">Safe</span>
          <span className="font-bold text-emerald-600">{safe}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full bg-rose-500" />
          <span className="text-gray-600">At risk</span>
          <span className="font-bold text-rose-600">{atRisk}</span>
        </span>
      </div>
    </div>
  );
}

/** Horizontal bars — the correct shape for comparing labelled magnitudes. */
function HBars({
  items,
  max,
  suffix = "",
  tone = "brand",
}: {
  items: { key: string; label: string; value: number; icon?: IconDefinition }[];
  max: number;
  suffix?: string;
  tone?: "brand" | "grade";
}) {
  const barColor = (v: number) => {
    if (tone === "grade") {
      if (v >= 75) return "bg-emerald-500";
      if (v >= 50) return "bg-amber-500";
      return "bg-rose-500";
    }
    return "bg-gradient-to-r from-brand-600 to-[#2a8a98]";
  };
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="flex w-40 shrink-0 items-center gap-2 text-sm text-gray-600 truncate">
            {item.icon && (
              <FontAwesomeIcon icon={item.icon} className="w-3.5 h-3.5 text-brand-600 shrink-0" />
            )}
            <span className="truncate">{item.label}</span>
          </span>
          <div className="h-2.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(item.value)}`}
              style={{ width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0) : 0}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-semibold text-gray-800 tabular-nums">
            {item.value}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

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
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded-full" />
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-96 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2">
            <SkeletonChartArea />
          </div>
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
  const activity = summary?.clinical_activity;
  const competencies = Object.entries(summary?.competency_breakdown ?? {}).sort(
    (a, b) => b[1] - a[1],
  );

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

  const activityItems = [
    { key: "vitals", label: "Vital Readings", value: activity?.vital_readings ?? 0, icon: faHeartbeat },
    { key: "anomalies", label: "Anomalies Flagged", value: activity?.anomalies ?? 0, icon: faExclamationTriangle },
    { key: "tpr", label: "TPR Entries", value: activity?.tpr_entries ?? 0, icon: faTemperatureHalf },
    { key: "ivf", label: "IVF Records", value: activity?.ivf_records ?? 0, icon: faDroplet },
    { key: "notes", label: "Progress Notes", value: activity?.progress_notes ?? 0, icon: faNotesMedical },
    { key: "reviewed", label: "Notes Reviewed", value: activity?.notes_reviewed ?? 0, icon: faCircleCheck },
  ];
  const activityMax = Math.max(1, ...activityItems.map((a) => a.value));

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
        <Card padding="md" className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Weekly Score Trend</h3>
            <span className="text-xs text-gray-400">avg quiz score, last {trend.length || 8} weeks</span>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {trend.length === 0 ? (
              <p className="text-gray-400 text-sm py-16 text-center">
                No submitted attempts in the last 8 weeks.
              </p>
            ) : (
              <TrendLineChart data={trend} />
            )}
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">At-Risk Prediction</h3>
          <div className="flex-1 flex items-center justify-center">
            {predicted === 0 ? (
              <div className="text-center">
                <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">
                  No predictions yet — the ML prediction service populates this once it runs.
                </p>
              </div>
            ) : (
              <RiskDonut safe={safe} atRisk={atRisk} />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
        <Card padding="md" className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Competency Breakdown</h3>
          <div className="flex-1 flex flex-col justify-center">
            {competencies.length === 0 ? (
              <p className="text-gray-400 text-sm py-12 text-center">
                No validated competency scores yet — record them from each student&apos;s profile.
              </p>
            ) : (
              <HBars
                items={competencies.map(([name, value]) => ({ key: name, label: name, value }))}
                max={100}
                suffix="%"
                tone="grade"
              />
            )}
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinical Training Activity</h3>
          <div className="flex-1 flex flex-col justify-center">
            <HBars items={activityItems} max={activityMax} />
          </div>
        </Card>
      </div>

      {summary?.etl?.last_run_at && (
        <p className="text-xs text-gray-400">
          Warehouse last refreshed {new Date(summary.etl.last_run_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
