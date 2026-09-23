"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChartBar,
  faUsers,
  faDoorOpen,
  faExclamationTriangle,
  faRotate,
  faHeartbeat,
  faNotesMedical,
  faClipboardCheck,
  faGraduationCap,
  faUserTie,
  faStethoscope,
  faBuilding,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch, fetchAnalyticsSummary, runWarehouseEtl } from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import { EcgLoader } from "../../components/EcgLoader";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";

interface AdminFacultyRow {
  name: string;
  sections: { id: string; name: string }[];
}

// Stable empty fallbacks, so nothing downstream sees a new value each render.
const NO_SECTION_FACULTY = new Map<string, string[]>();

/** Section header: an icon in a rounded box beside a title and, sometimes, a
 * one-line note — the same identity mark every card below uses. */
function CardHeading({
  icon,
  title,
  subtitle,
}: {
  icon: IconDefinition;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
        <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Medal for the top three, a plain number below that — the same ranking
 * language the student leaderboard uses. */
function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm";
  if (rank === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  if (rank === 3) return "bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm";
  return "bg-gray-100 text-gray-500";
}

/** One row shared by every list below: a badge, a proportional fill bar
 * behind the text, and a bold trailing figure — magnitude and rank both
 * legible at a glance instead of a plain number in a table cell. */
function BarRow({
  badge,
  badgeClass,
  label,
  sublabel,
  fillPct,
  fillClass,
  trailing,
  trailingSub,
}: {
  badge: ReactNode;
  badgeClass: string;
  label: string;
  sublabel?: string;
  fillPct: number;
  fillClass: string;
  trailing: ReactNode;
  trailingSub?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-hairline bg-surface p-3">
      <div
        className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${fillClass}`}
        style={{ width: `${Math.min(Math.max(fillPct, 0), 100)}%` }}
        aria-hidden
      />
      <span
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
      >
        {badge}
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{label}</p>
        {sublabel && <p className="truncate text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="relative z-10 shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-gray-800">{trailing}</p>
        {trailingSub && <p className="text-[11px] text-gray-400">{trailingSub}</p>}
      </div>
    </div>
  );
}

/**
 * Drawn at the card's real pixel width via a measured viewBox, rather than a
 * fixed one — a fixed viewBox on a wide card either stretches the line/text
 * (distorted) or, with `meet` scaling, letterboxes with dead space on both
 * sides once the card is much wider than the chart's own aspect ratio.
 */
function WeeklyTrendChart({
  trend,
}: {
  trend: { week_start: string; average_score: number; attempts: number }[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Score is always a 0–100 percentage, so the y-axis is a fixed domain
  // rather than scaled to the data's own min/max — that keeps a 60% week
  // from ever looking visually like an 80% week.
  const W = width || 760;
  const H = 190;
  const marginLeft = 34;
  const marginRight = 12;
  const marginTop = 22;
  const marginBottom = 28;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const n = trend.length;
  const xScale = (i: number) => marginLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yScale = (v: number) => marginTop + (1 - v / 100) * plotH;
  const ticks = [0, 25, 50, 75, 100];
  const points = trend.map((week, i) => ({
    x: xScale(i),
    y: yScale(week.average_score),
    week,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const baseline = marginTop + plotH;
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`
      : "";
  const bandWidth = n > 1 ? plotW / (n - 1) : plotW;

  return (
    <div ref={boxRef} className="h-[190px] w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        role="img"
        aria-label="Weekly average quiz score over the last 8 weeks"
      >
        <defs>
          <linearGradient id="weeklyTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b6b7b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1b6b7b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const ty = yScale(t);
          return (
            <g key={t}>
              <line x1={marginLeft} y1={ty} x2={marginLeft + plotW} y2={ty} stroke="#e5e7eb" strokeWidth="1" />
              <text x={marginLeft - 8} y={ty + 3} textAnchor="end" fontSize="10" fill="#9ca3af">
                {t}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#weeklyTrendFill)" stroke="none" />}
        <path d={linePath} fill="none" stroke="#1b6b7b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => {
          const tooltipX = Math.min(Math.max(p.x - 55, marginLeft), W - marginRight - 110);
          const tooltipY = Math.max(p.y - 42, 2);
          return (
            <g key={p.week.week_start} className="group">
              <rect
                x={p.x - bandWidth / 2}
                y={marginTop}
                width={bandWidth}
                height={plotH}
                fill="transparent"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#1b6b7b"
                stroke="#ffffff"
                strokeWidth="2"
                className="transition-opacity group-hover:opacity-80"
              />
              {i === points.length - 1 && (
                <text x={p.x} y={Math.max(p.y - 10, 12)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1b6b7b">
                  {p.week.average_score}%
                </text>
              )}
              <text x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">
                {new Date(p.week.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
              <foreignObject
                x={tooltipX}
                y={tooltipY}
                width="110"
                height="28"
                className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <div className="bg-brand-600 text-white text-[11px] leading-tight px-2 py-1 rounded shadow-lg text-center whitespace-nowrap">
                  {p.week.average_score}% · {p.week.attempts} attempt{p.week.attempts === 1 ? "" : "s"}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ROOM_STATUS_TONE: Record<string, { badge: string; fill: string; label: string }> = {
  active: { badge: "bg-emerald-100 text-emerald-600", fill: "bg-emerald-500/[0.08]", label: "Active" },
  inactive: { badge: "bg-gray-100 text-gray-500", fill: "bg-gray-400/[0.08]", label: "Inactive" },
  maintenance: { badge: "bg-amber-100 text-amber-600", fill: "bg-amber-500/[0.08]", label: "Maintenance" },
};

export default function AdminAnalyticsClient() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refresh: load } = usePageData("admin:analytics", async () => {
    const [{ summary }, facultyRes] = await Promise.all([
      fetchAnalyticsSummary({ sectionTrend: true }),
      apiFetch("/api/admin/faculty", { credentials: "include" }),
    ]);
    const facultyJson = facultyRes.ok
      ? ((await facultyRes.json()) as { faculty?: AdminFacultyRow[] })
      : {};

    // Which faculty teach each section, so the performance ranking below can
    // read by name instead of by section code.
    const sectionFaculty = new Map<string, string[]>();
    for (const f of facultyJson.faculty ?? []) {
      for (const s of f.sections) {
        sectionFaculty.set(s.id, [...(sectionFaculty.get(s.id) ?? []), f.name]);
      }
    }

    return { summary, sectionFaculty };
  });

  const summary = data?.summary ?? null;
  const sectionFaculty = data?.sectionFaculty ?? NO_SECTION_FACULTY;

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

  const atRisk = summary?.risk_distribution?.at_risk ?? 0;
  const activeRooms = (summary?.room_utilization ?? []).filter((r) => r.status === "active").length;
  const trend = summary?.weekly_trend ?? [];
  const activity = summary?.clinical_activity;
  const activeRate = summary?.cohort.total_students
    ? Math.min(100, Math.round((summary.cohort.active_students_30d / summary.cohort.total_students) * 100))
    : 0;

  // Rooms, busiest first.
  const rooms = [...(summary?.room_utilization ?? [])].sort(
    (a, b) => b.utilization_pct - a.utilization_pct,
  );

  // The six clinical-activity counters, scaled against whichever is largest
  // so every bar reads relative to the busiest metric, not an absolute scale.
  const activityItems = [
    { key: "vital_readings", label: "Vital Readings", icon: faHeartbeat, value: activity?.vital_readings ?? 0 },
    { key: "anomalies", label: "Anomalies Flagged", icon: faExclamationTriangle, value: activity?.anomalies ?? 0 },
    { key: "tpr_entries", label: "TPR Entries", icon: faNotesMedical, value: activity?.tpr_entries ?? 0 },
    { key: "ivf_records", label: "IVF Records", icon: faNotesMedical, value: activity?.ivf_records ?? 0 },
    { key: "progress_notes", label: "Progress Notes", icon: faNotesMedical, value: activity?.progress_notes ?? 0 },
    { key: "notes_reviewed", label: "Notes Reviewed", icon: faClipboardCheck, value: activity?.notes_reviewed ?? 0 },
  ];
  const activityMax = Math.max(...activityItems.map((i) => i.value), 1);

  // Section performance rolled up from the weekly trend, then relabeled by
  // whoever teaches that section — a faculty ranking built on their
  // students' own submitted scores, not a self-reported figure.
  const sectionAgg = new Map<string, { name: string; weightedScore: number; attempts: number }>();
  for (const row of summary?.section_trend ?? []) {
    const entry = sectionAgg.get(row.section_id) ?? {
      name: row.section_name,
      weightedScore: 0,
      attempts: 0,
    };
    entry.weightedScore += row.average_score * row.attempts;
    entry.attempts += row.attempts;
    sectionAgg.set(row.section_id, entry);
  }
  const facultyPerf = Array.from(sectionAgg.entries())
    .map(([sectionId, agg]) => {
      const students = summary?.sections.find((s) => s.id === sectionId)?.students ?? 0;
      const names = sectionFaculty.get(sectionId);
      const label = names && names.length > 0 ? names.join(" & ") : agg.name;
      return {
        sectionId,
        label,
        sectionName: agg.name,
        avgScore: agg.attempts > 0 ? Math.round(agg.weightedScore / agg.attempts) : 0,
        attempts: agg.attempts,
        students,
      };
    })
    .filter((r) => r.attempts > 0)
    .sort((a, b) => b.avgScore - a.avgScore);
  const facultyPerfMax = Math.max(...facultyPerf.map((f) => f.avgScore), 1);

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faChartBar} className="w-3.5 h-3.5" />,
          label: "Warehouse Analytics",
        }}
        title="Analytics Dashboard"
        subtitle={
          summary?.etl?.last_run_at
            ? `Cohort analytics from the iCARE++ star-schema warehouse · last refreshed ${new Date(summary.etl.last_run_at).toLocaleString()}`
            : "Cohort analytics from the iCARE++ star-schema warehouse"
        }
        action={{
          icon: refreshing ? <EcgLoader /> : <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />,
          onClick: handleRefresh,
          label: "Refresh Warehouse",
          text: refreshing ? "Refreshing…" : "Refresh Warehouse",
          disabled: refreshing,
        }}
      />

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <EcgLoader size="lg" className="text-brand-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              icon={faUsers}
              value={summary?.cohort.total_students ?? 0}
              label="Total Students"
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
            <StatTile
              icon={faExclamationTriangle}
              value={atRisk}
              label="At-Risk Students"
              iconBg="bg-rose-50"
              iconColor="text-rose-600"
            />
            <StatTile
              icon={faDoorOpen}
              value={activeRooms}
              label="Active Rooms"
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
            />
            <StatTile
              icon={faChartBar}
              value={summary?.cohort.average_score != null ? `${summary.cohort.average_score}%` : "—"}
              label="Avg. Quiz Score"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
          </div>

          {/* Weekly Quiz Performance */}
          <div className="mb-6">
            <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-tile">
              <CardHeading icon={faChartBar} title="Weekly Quiz Performance" />
              {trend.length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">
                  No submitted attempts in the last 8 weeks.
                </p>
              ) : (
                <>
                  <WeeklyTrendChart trend={trend} />
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

                  {(summary?.risk_distribution?.at_risk ?? 0) > 0 && (
                    <div className="mt-4 pt-4 border-t border-hairline">
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
                </>
              )}
            </div>
          </div>

          {/* Room Utilization + Faculty Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-tile">
              <CardHeading icon={faBuilding} title="Room Utilization" subtitle="Busiest rooms first" />
              {rooms.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">No rooms configured.</p>
              ) : (
                <div className="space-y-2">
                  {rooms.map((room) => {
                    const tone = ROOM_STATUS_TONE[room.status] ?? ROOM_STATUS_TONE.inactive;
                    return (
                      <BarRow
                        key={`${room.name}-${room.room_number}`}
                        badge={<FontAwesomeIcon icon={faDoorOpen} className="h-3.5 w-3.5" />}
                        badgeClass={tone.badge}
                        label={room.name}
                        sublabel={`Room ${room.room_number} · ${tone.label}`}
                        fillPct={room.utilization_pct}
                        fillClass={tone.fill}
                        trailing={`${room.utilization_pct}%`}
                        trailingSub={`${room.assigned}/${room.capacity}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-surface p-6 rounded-2xl border border-hairline shadow-tile">
              <CardHeading
                icon={faUserTie}
                title="Faculty Performance"
                subtitle="Ranked by their students' average submitted score"
              />
              {facultyPerf.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">
                  No submitted attempts in range yet — rankings appear once students start.
                </p>
              ) : (
                <div className="space-y-2">
                  {facultyPerf.map((f, i) => (
                    <BarRow
                      key={f.sectionId}
                      badge={i + 1}
                      badgeClass={rankBadgeClass(i + 1)}
                      label={f.label}
                      sublabel={`${f.sectionName !== f.label ? `${f.sectionName} · ` : ""}${f.students} student${f.students === 1 ? "" : "s"} · ${f.attempts} attempt${f.attempts === 1 ? "" : "s"}`}
                      fillPct={(f.avgScore / facultyPerfMax) * 100}
                      fillClass="bg-brand-600/[0.06]"
                      trailing={`${f.avgScore}%`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clinical/Patient Activity + Completion Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-surface p-6 rounded-2xl border border-hairline shadow-tile">
              <CardHeading
                icon={faStethoscope}
                title="Patient Care Activity"
                subtitle="Charting volume across the cohort"
              />
              <div className="space-y-2">
                {activityItems.map((item) => (
                  <BarRow
                    key={item.key}
                    badge={<FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />}
                    badgeClass="bg-brand-600/10 text-brand-600"
                    label={item.label}
                    fillPct={(item.value / activityMax) * 100}
                    fillClass="bg-brand-600/[0.06]"
                    trailing={item.value}
                  />
                ))}
              </div>
            </div>

            {/* Engagement Overview */}
            <div className="flex h-full flex-col bg-surface p-6 rounded-2xl border border-hairline shadow-tile">
              <CardHeading
                icon={faGraduationCap}
                title="Engagement Overview"
                subtitle="Share of the cohort active in the last 30 days"
              />
              <div className="flex flex-1 flex-col items-center justify-center gap-6">
                <div className="relative w-40 h-40 shrink-0">
                  <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="54" fill="none"
                      stroke="url(#completionGradient)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(activeRate / 100) * 339.292} 339.292`}
                    />
                    <defs>
                      <linearGradient id="completionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#155663" />
                        <stop offset="100%" stopColor="#2a8a98" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-gray-900">{activeRate}%</p>
                    <p className="text-xs text-gray-500">Active</p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-lg font-bold text-gray-800">{summary?.cohort.total_students ?? 0}</p>
                    <p className="text-[11px] text-gray-500">Students</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-lg font-bold text-emerald-700">{summary?.cohort.submitted_attempts ?? 0}</p>
                    <p className="text-[11px] text-emerald-600">Attempts</p>
                  </div>
                  <div className="rounded-lg bg-brand-50 p-3">
                    <p className="text-lg font-bold text-brand-700">{summary?.cohort.active_students_30d ?? 0}</p>
                    <p className="text-[11px] text-brand-600">Active (30d)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Competency Performance Ranking */}
          {(summary?.competency_detail ?? []).length > 0 && (
            <div className="bg-surface p-6 rounded-2xl border border-hairline shadow-tile mb-6">
              <CardHeading icon={faChartBar} title="Competency Performance" />
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
          )}

          <div className="bg-surface rounded-2xl border border-hairline shadow-tile overflow-hidden">
            <div className="p-6 border-b border-hairline">
              <h3 className="font-display text-lg font-semibold text-gray-900">Competency Assessment Summary</h3>
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
