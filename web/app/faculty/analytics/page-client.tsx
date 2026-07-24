"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  faChevronDown,
  faCheck,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  fetchAnalyticsSummary,
  fetchFacultySections,
  AnalyticsSummary,
  AnalyticsBucket,
  Section,
} from "../../lib/api";
import { SkeletonStatCard, SkeletonChartArea, SkeletonCompetencyGrid } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import Card, { CardLabel } from "../../components/Card";
import StatTile from "../../components/StatTile";

const BRAND = "#1B6B7B";

/* ---------------------------------------------------------------- dates */

/** Local YYYY-MM-DD. `toISOString()` would shift the day in most timezones. */
function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parsed as local midnight, so a bucket start never renders as the day before. */
function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

type PresetId = "7d" | "30d" | "3m" | "12m" | "ytd" | "custom";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "3m", label: "3 months" },
  { id: "12m", label: "12 months" },
  { id: "ytd", label: "This year" },
  { id: "custom", label: "Custom" },
];

/** Ranges are inclusive of both ends, matching the SQL `>= from and <= to`. */
function rangeForPreset(preset: Exclude<PresetId, "custom">): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  switch (preset) {
    case "7d":
      from.setDate(from.getDate() - 6);
      break;
    case "30d":
      from.setDate(from.getDate() - 29);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
    case "ytd":
      from.setMonth(0, 1);
      break;
  }
  return { from: isoDay(from), to: isoDay(today) };
}

const BUCKET_LABEL: Record<AnalyticsBucket, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};

/** X-axis tick text, tightened as the buckets get coarser. */
function formatBucket(value: string, bucket: AnalyticsBucket): string {
  const d = parseDay(value);
  if (bucket === "year") return `${d.getFullYear()}`;
  if (bucket === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRange(from: string, to: string): string {
  const a = parseDay(from);
  const b = parseDay(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

/* --------------------------------------------------------------- charts */

/** Score trend over time — a line + area chart, the correct shape for a series. */
function TrendLineChart({
  data,
  bucket,
}: {
  data: { week_start: string; average_score: number; attempts: number }[];
  bucket: AnalyticsBucket;
}) {
  const W = 600;
  const H = 210;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 32; // room for the x-axis ticks drawn inside the viewBox
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
  // A year of days would print 365 ticks over 600px; show at most ~8, always
  // including the last so the range's end date is readable.
  const tickStep = Math.max(1, Math.ceil(n / 8));
  const isTick = (i: number) => i % tickStep === 0 || i === n - 1;

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
            r={n > 40 ? 2 : 3.5}
            fill="#fff"
            stroke={BRAND}
            strokeWidth="2"
          >
            <title>
              {`${formatBucket(d.week_start, bucket)} — ${d.average_score}% · ${d.attempts} attempt${
                d.attempts === 1 ? "" : "s"
              }`}
            </title>
          </circle>
        ))}
        {data.map((d, i) =>
          isTick(i) ? (
            <text
              key={`t-${d.week_start}`}
              x={x(i)}
              y={H - 10}
              // The end ticks would otherwise overhang the viewBox.
              textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
              fontSize="9"
              fill="#94a3b8"
            >
              {formatBucket(d.week_start, bucket)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------- filters */

/** Multi-select over the sections the faculty member manages. */
function SectionPicker({
  sections,
  selected,
  counts,
  onChange,
}: {
  sections: Section[];
  selected: string[];
  counts: Record<string, number>;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Empty selection means "everything I manage" — the same thing the API does
  // when no section_ids are sent.
  const allSelected = selected.length === 0 || selected.length === sections.length;
  const summary = allSelected
    ? "All sections"
    : selected.length === 1
      ? (sections.find((s) => s.id === selected[0])?.name ?? "1 section")
      : `${selected.length} sections`;

  const toggle = (id: string) => {
    const base = selected.length === 0 ? sections.map((s) => s.id) : selected;
    const next = base.includes(id) ? base.filter((s) => s !== id) : [...base, id];
    onChange(next);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={sections.length === 0}
        className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faLayerGroup} className="w-3.5 h-3.5 text-brand-600" />
        <span className="font-medium">{summary}</span>
        <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-lg border border-hairline bg-surface p-1.5 shadow-overlay">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-subtle"
          >
            <span className="font-medium">All sections</span>
            {allSelected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-brand-600" />}
          </button>
          <div className="my-1 h-px bg-hairline" />
          {sections.map((section) => {
            const on = selected.length === 0 || selected.includes(section.id);
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => toggle(section.id)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-subtle"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {on && <FontAwesomeIcon icon={faCheck} className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{section.name}</span>
                </span>
                <span className="ml-2 shrink-0 text-xs text-gray-400 tabular-nums">
                  {counts[section.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
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
  const [bucket, setBucket] = useState<AnalyticsBucket>("week");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetId>("3m");
  // Lazily initialised so `new Date()` never runs during a server render —
  // the first paint is the skeleton, so there is nothing to mismatch.
  const [range, setRange] = useState<{ from: string; to: string }>(() => rangeForPreset("3m"));
  // What the custom date inputs show. Kept separate from `range` (the applied
  // query) so a half-typed or inverted range doesn't fire a request, while the
  // controlled inputs still track every keystroke.
  const [draft, setDraft] = useState<{ from: string; to: string }>(() => rangeForPreset("3m"));

  useEffect(() => {
    (async () => setSections(await fetchFacultySections()))();
  }, []);

  const { from, to } = range;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setRefreshing(true);
      const result = await fetchAnalyticsSummary({ sectionIds, from, to }, controller.signal);
      if (controller.signal.aborted) return;
      setSummary(result.summary);
      setBucket(result.bucket);
      setLoading(false);
      setRefreshing(false);
    })();
    return () => controller.abort();
  }, [sectionIds, from, to]);

  const applyPreset = useCallback((id: PresetId) => {
    setPreset(id);
    if (id === "custom") return;
    const next = rangeForPreset(id);
    setRange(next);
    setDraft(next);
  }, []);

  const setCustom = (edge: "from" | "to", value: string) => {
    const next = { ...draft, [edge]: value };
    setDraft(next);
    // Only a complete, ordered range becomes a query; the input still shows
    // every keystroke.
    if (next.from && next.to && next.from <= next.to) setRange(next);
  };

  const studentsBySection = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of summary?.sections ?? []) counts[s.id] = s.students;
    return counts;
  }, [summary]);

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
      label: "Active Students (in range)",
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

      <div className="mb-4 rounded-xl border border-hairline bg-surface shadow-tile">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CardLabel>Sections</CardLabel>
            <SectionPicker
              sections={sections}
              selected={sectionIds}
              counts={studentsBySection}
              onChange={setSectionIds}
            />
          </div>

          <span className="hidden h-6 w-px bg-hairline sm:block" />

          <div className="flex items-center gap-2.5">
            <CardLabel>Range</CardLabel>
            <div className="flex flex-wrap items-center gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    preset === p.id
                      ? "bg-brand-600 text-white"
                      : "text-gray-600 hover:bg-subtle hover:text-gray-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(e) => setCustom("from", e.target.value)}
                className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-sm text-gray-700"
                aria-label="Range start"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) => setCustom("to", e.target.value)}
                className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-sm text-gray-700"
                aria-label="Range end"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            {refreshing && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            )}
            <span className="tabular-nums">{formatRange(from, to)}</span>
          </div>
        </div>

        {sections.length === 0 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-amber-700">
            You don&apos;t manage any sections yet, so there is nothing to report on. An admin
            assigns sections from Admin → Faculty.
          </p>
        )}
      </div>

      {/* Refetches dim the panels in place rather than tearing the page down
          to skeletons, so changing a filter doesn't make the layout jump. */}
      <div className={`transition-opacity duration-200 ${refreshing ? "opacity-60" : ""}`}>
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
              <h3 className="text-lg font-semibold text-gray-900">Score Trend</h3>
              <span className="text-xs text-gray-400">
                avg quiz score, {BUCKET_LABEL[bucket]}
              </span>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              {trend.length === 0 ? (
                <p className="text-gray-400 text-sm py-16 text-center">
                  No submitted attempts in {formatRange(from, to)}.
                </p>
              ) : (
                <TrendLineChart data={trend} bucket={bucket} />
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
      </div>

      {summary?.etl?.last_run_at && (
        <p className="text-xs text-gray-400">
          Warehouse last refreshed {new Date(summary.etl.last_run_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
