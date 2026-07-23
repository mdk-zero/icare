"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faUsers,
  faClipboardCheck,
  faHeartbeat,
  faTriangleExclamation,
  faNotesMedical,
  faDroplet,
  faTemperatureHalf,
  faCircleCheck,
  faArrowTrendUp,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { fetchAnalyticsSummary, AnalyticsSummary } from "../../lib/api";

const BRAND = "#1B6B7B";
const MINT = "#5eead4";
const TEAL_GRADIENT =
  "linear-gradient(135deg, #072e2e 0%, #0d4a4a 42%, #10605f 72%, #0b3d3d 100%)";
// Fine fractal-noise tile for masthead grain.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* --------------------------------- charts -------------------------------- */

/** Tiny mint line for the masthead — a glance at the trajectory. */
function MiniSparkline({ data }: { data: { average_score: number }[] }) {
  if (data.length < 2) return null;
  const W = 176;
  const H = 46;
  const p = 4;
  const xs = data.map((_, i) => p + (i / (data.length - 1)) * (W - 2 * p));
  const ys = data.map(
    (d) => p + (1 - Math.min(Math.max(d.average_score, 0), 100) / 100) * (H - 2 * p),
  );
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const area =
    `M ${xs[0]},${H - p} ` + xs.map((x, i) => `L ${x},${ys[i]}`).join(" ") + ` L ${xs[xs.length - 1]},${H - p} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-44">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={MINT} stopOpacity="0.45" />
          <stop offset="100%" stopColor={MINT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <polyline points={line} fill="none" stroke={MINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={MINT} />
    </svg>
  );
}

/** Score trend — line + area, the correct shape for a time series. */
function TrendLineChart({
  data,
}: {
  data: { week_start: string; average_score: number; attempts: number }[];
}) {
  const W = 620;
  const H = 210;
  const padL = 26;
  const padR = 10;
  const padT = 14;
  const padB = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;
  const line = data.map((d, i) => `${x(i)},${y(d.average_score)}`).join(" ");
  const area =
    n > 0
      ? `M ${x(0)},${y(0)} ` + data.map((d, i) => `L ${x(i)},${y(d.average_score)}`).join(" ") + ` L ${x(n - 1)},${y(0)} Z`
      : "";
  const grid = [0, 25, 50, 75, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity="0.20" />
            <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              y1={y(g)}
              x2={W - padR}
              y2={y(g)}
              stroke="currentColor"
              className="text-gray-200"
              strokeWidth="1"
              strokeDasharray={g === 0 ? "0" : "2 4"}
            />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="9" className="fill-gray-400 font-mono">
              {g}
            </text>
          </g>
        ))}
        {n > 1 && <path d={area} fill="url(#trendArea)" />}
        {n > 1 && (
          <polyline points={line} fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {data.map((d, i) => (
          <circle key={d.week_start} cx={x(i)} cy={y(d.average_score)} r="3.5" fill="var(--color-surface)" stroke={BRAND} strokeWidth="2">
            <title>{`${d.average_score}% · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {data.map((week) => (
          <span key={week.week_start} className="font-mono text-[10px] text-gray-400">
            {new Date(week.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Safe vs at-risk — a donut, the correct shape for a part-to-whole. */
function RiskDonut({ safe, atRisk }: { safe: number; atRisk: number }) {
  const total = safe + atRisk;
  const r = 54;
  const c = 2 * Math.PI * r;
  const safeLen = total ? (safe / total) * c : 0;
  const atRiskLen = total ? (atRisk / total) * c : 0;
  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="relative h-[144px] w-[144px]">
        <svg viewBox="0 0 144 144" className="h-full w-full -rotate-90">
          <circle cx="72" cy="72" r={r} fill="none" stroke="currentColor" className="text-gray-100" strokeWidth="15" />
          {safeLen > 0 && (
            <circle cx="72" cy="72" r={r} fill="none" stroke="#10b981" strokeWidth="15" strokeDasharray={`${safeLen} ${c}`} />
          )}
          {atRiskLen > 0 && (
            <circle cx="72" cy="72" r={r} fill="none" stroke="#f43f5e" strokeWidth="15" strokeDasharray={`${atRiskLen} ${c}`} strokeDashoffset={-safeLen} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-brico text-3xl font-extrabold text-gray-900 tabular-nums">{total}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">predicted</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-gray-600">Safe</span>
          <span className="ml-auto font-brico font-bold text-emerald-600 tabular-nums">{safe}</span>
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          <span className="text-gray-600">At risk</span>
          <span className="ml-auto font-brico font-bold text-rose-600 tabular-nums">{atRisk}</span>
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars — the correct shape for comparing labelled magnitudes. */
function HBars({
  items,
  max,
  suffix = "",
  grade = false,
}: {
  items: { key: string; label: string; value: number; icon?: IconDefinition }[];
  max: number;
  suffix?: string;
  grade?: boolean;
}) {
  const barColor = (v: number) => {
    if (!grade) return "bg-gradient-to-r from-brand-600 to-[#2a8a98]";
    if (v >= 75) return "bg-emerald-500";
    if (v >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };
  return (
    <div className="space-y-3.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="flex w-40 shrink-0 items-center gap-2 truncate text-sm text-gray-600">
            {item.icon && <FontAwesomeIcon icon={item.icon} className="w-3.5 h-3.5 shrink-0 text-brand-600" />}
            <span className="truncate">{item.label}</span>
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor(item.value)}`}
              style={{ width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0) : 0}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-brico text-sm font-bold text-gray-800 tabular-nums">
            {item.value}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */

function SectionHeader({ n, title, meta }: { n: string; title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-mono text-[11px] font-medium tracking-[0.22em] text-brand-600">{n}</span>
      <h3 className="font-brico text-lg font-bold text-gray-900">{title}</h3>
      {meta && (
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">{meta}</span>
      )}
    </div>
  );
}

function Panel({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={`animate-rise rounded-2xl border border-hairline bg-surface p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}

/* ---------------------------------- page --------------------------------- */

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
      <div className="animate-pulse space-y-4">
        <div className="h-52 rounded-2xl bg-gray-200/70" />
        <div className="h-28 rounded-2xl bg-gray-200/60" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-72 rounded-2xl bg-gray-200/60 lg:col-span-2" />
          <div className="h-72 rounded-2xl bg-gray-200/60" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 rounded-2xl bg-gray-200/60" />
          <div className="h-56 rounded-2xl bg-gray-200/60" />
        </div>
      </div>
    );
  }

  const atRisk = summary?.risk_distribution?.at_risk ?? 0;
  const safe = summary?.risk_distribution?.safe ?? 0;
  const predicted = atRisk + safe;
  const trend = summary?.weekly_trend ?? [];
  const activity = summary?.clinical_activity;
  const avg = summary?.cohort.average_score;
  const competencies = Object.entries(summary?.competency_breakdown ?? {}).sort((a, b) => b[1] - a[1]);

  const kpis: { icon: IconDefinition; label: string; value: string; sub: string; color: string }[] = [
    {
      icon: faClipboardCheck,
      label: "Submitted",
      value: `${summary?.cohort.submitted_attempts ?? 0}`,
      sub: "quiz attempts",
      color: "#2563eb",
    },
    {
      icon: faUsers,
      label: "Active",
      value: `${summary?.cohort.active_students_30d ?? 0}/${summary?.cohort.total_students ?? 0}`,
      sub: "students · 30 days",
      color: "#7c3aed",
    },
    {
      icon: faTriangleExclamation,
      label: "At risk",
      value: `${atRisk}`,
      sub: "flagged by model",
      color: "#d97706",
    },
    {
      icon: faArrowTrendUp,
      label: "Momentum",
      value: trend.length >= 2 ? `${trend[trend.length - 1].average_score - trend[0].average_score >= 0 ? "+" : ""}${trend[trend.length - 1].average_score - trend[0].average_score}` : "—",
      sub: "pts since week 1",
      color: BRAND,
    },
  ];

  const activityItems = [
    { key: "vitals", label: "Vital Readings", value: activity?.vital_readings ?? 0, icon: faHeartbeat },
    { key: "anomalies", label: "Anomalies Flagged", value: activity?.anomalies ?? 0, icon: faTriangleExclamation },
    { key: "tpr", label: "TPR Entries", value: activity?.tpr_entries ?? 0, icon: faTemperatureHalf },
    { key: "ivf", label: "IVF Records", value: activity?.ivf_records ?? 0, icon: faDroplet },
    { key: "notes", label: "Progress Notes", value: activity?.progress_notes ?? 0, icon: faNotesMedical },
    { key: "reviewed", label: "Notes Reviewed", value: activity?.notes_reviewed ?? 0, icon: faCircleCheck },
  ];
  const activityMax = Math.max(1, ...activityItems.map((a) => a.value));

  return (
    <div className="pb-2">
      {/* ---------------------------- masthead ---------------------------- */}
      <div
        className="animate-rise relative mb-4 overflow-hidden rounded-2xl"
        style={{ background: TEAL_GRADIENT }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-soft-light"
          style={{ backgroundImage: NOISE }}
        />
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full"
          style={{ background: `radial-gradient(circle, ${MINT}40, transparent 68%)` }}
        />
        <div className="relative flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5eead4] ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5eead4]" />
              Warehouse · Live
            </span>
            <h1 className="font-brico mt-4 text-4xl font-extrabold leading-[0.92] tracking-tight text-white sm:text-5xl">
              Cohort
              <br />
              Analytics
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
              Performance and clinical-training signals distilled from the iCARE++ star-schema
              warehouse.
            </p>
            {summary?.etl?.last_run_at && (
              <p className="mt-4 font-mono text-[11px] text-white/40">
                refreshed {new Date(summary.etl.last_run_at).toLocaleString()}
              </p>
            )}
          </div>

          <div className="shrink-0 lg:text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Cohort average
            </div>
            <div className="mt-1 flex items-end gap-1 lg:justify-end">
              <span className="font-brico text-7xl font-extrabold leading-none tracking-tight text-white tabular-nums">
                {avg != null ? avg : "—"}
              </span>
              {avg != null && <span className="font-brico mb-2 text-3xl font-bold text-[#5eead4]">%</span>}
            </div>
            <div className="mt-3 flex lg:justify-end">
              <MiniSparkline data={trend} />
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------- KPI strip ---------------------------- */}
      <div
        className="animate-rise mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-gray-200/70 lg:grid-cols-4"
        style={{ animationDelay: "80ms" }}
      >
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface p-5">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gray-500">
              <FontAwesomeIcon icon={k.icon} className="w-3 h-3" style={{ color: k.color }} />
              {k.label}
            </div>
            <div className="font-brico mt-2 text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">
              {k.value}
            </div>
            <div className="mt-1 text-xs text-gray-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ----------------------- trajectory + risk ------------------------ */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" delay={160}>
          <SectionHeader n="02" title="Trajectory" meta={`avg score · ${trend.length || 8}w`} />
          {trend.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FontAwesomeIcon icon={faChartLine} className="mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No submitted attempts in the last 8 weeks.</p>
            </div>
          ) : (
            <TrendLineChart data={trend} />
          )}
        </Panel>

        <Panel delay={200}>
          <SectionHeader n="03" title="Risk" meta="ML model" />
          {predicted === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">
                No predictions yet — the prediction service populates this once it runs.
              </p>
            </div>
          ) : (
            <RiskDonut safe={safe} atRisk={atRisk} />
          )}
        </Panel>
      </div>

      {/* --------------------- competency + activity ---------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel delay={280}>
          <SectionHeader n="04" title="Competency" meta="validated" />
          {competencies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FontAwesomeIcon icon={faCircleCheck} className="mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">
                No validated competency scores yet — record them from each student&apos;s profile.
              </p>
            </div>
          ) : (
            <HBars
              items={competencies.map(([name, value]) => ({ key: name, label: name, value }))}
              max={100}
              suffix="%"
              grade
            />
          )}
        </Panel>

        <Panel delay={320}>
          <SectionHeader n="05" title="Clinical Activity" meta="events logged" />
          <HBars items={activityItems} max={activityMax} />
        </Panel>
      </div>
    </div>
  );
}
