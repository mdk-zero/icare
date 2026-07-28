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
  faWandMagicSparkles,
  faArrowsRotate,
  faChevronUp,
  faBrain,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  fetchAnalyticsSummary,
  fetchFacultySections,
  generateAnalyticsNarrative,
  runFacultyMlJob,
  AnalyticsSummary,
  AnalyticsNarrative,
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

/** Score trend over time — a smooth spline + area chart. */
function TrendLineChart({
  data,
  bucket,
}: {
  data: { week_start: string; average_score: number; attempts: number }[];
  bucket: AnalyticsBucket;
}) {
  const W = 600;
  const H = 220;
  const padL = 32;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.average_score) }));
  const grid = [0, 25, 50, 75, 100];
  const tickStep = Math.max(1, Math.ceil(n / 8));
  const isTick = (i: number) => i % tickStep === 0 || i === n - 1;

  // Catmull-Rom → cubic bezier for a smooth curve without overshoot
  const smoothPath = (points: { x: number; y: number }[]): string => {
    if (points.length < 2) return "";
    if (points.length === 2)
      return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p2.x - p0.x) / 6;
      const cp2y = p2.y - (p2.y - p0.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const lineD = smoothPath(pts);
  const areaD =
    n > 1
      ? lineD + ` L ${pts[n - 1].x},${padT + plotH} L ${pts[0].x},${padT + plotH} Z`
      : "";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity="0.25" />
            <stop offset="100%" stopColor={BRAND} stopOpacity="0.02" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" className="tabular-nums">
              {g}
            </text>
          </g>
        ))}
        {n > 1 && <path d={areaD} fill="url(#trendArea)" />}
        {n > 1 && (
          <path d={lineD} fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* Glow layer under dots */}
        {n <= 40 && data.map((d, i) => (
          <circle key={`g-${d.week_start}`} cx={pts[i].x} cy={pts[i].y} r={5} fill={BRAND} opacity="0.15" filter="url(#glow)" />
        ))}
        {data.map((d, i) => (
          <circle
            key={d.week_start}
            cx={pts[i].x}
            cy={pts[i].y}
            r={n > 40 ? 2 : 4}
            fill="#fff"
            stroke={BRAND}
            strokeWidth="2.5"
          >
            <title>
              {`${formatBucket(d.week_start, bucket)} — ${d.average_score}% · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}`}
            </title>
          </circle>
        ))}
        {data.map((d, i) =>
          isTick(i) ? (
            <text
              key={`t-${d.week_start}`}
              x={pts[i].x}
              y={H - 8}
              textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
              fontSize="10"
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
  const r = 48;
  const cx = 70;
  const cy = 70;
  const sw = 20;
  const gap = 4;
  const c = 2 * Math.PI * r;
  const totalLen = c - gap * 2;
  const safeLen = total ? (safe / total) * totalLen : 0;
  const atRiskLen = total ? (atRisk / total) * totalLen : 0;
  const offset = -gap;

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
              stroke="url(#safeGrad)"
              strokeWidth={sw}
              strokeDasharray={`${safeLen} ${c - safeLen}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          )}
          {atRiskLen > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="url(#riskGrad)"
              strokeWidth={sw}
              strokeDasharray={`${atRiskLen} ${c - atRiskLen}`}
              strokeDashoffset={safeLen > 0 ? -(safeLen + gap * 2) : offset}
              strokeLinecap="round"
            />
          )}
          <defs>
            <linearGradient id="safeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900">{total}</span>
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">predicted</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-100" />
          <span className="text-gray-500">Safe</span>
          <span className="font-bold text-gray-900">{safe}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-100" />
          <span className="text-gray-500">At risk</span>
          <span className="font-bold text-gray-900">{atRisk}</span>
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
      if (v >= 75) return "bg-emerald-600";
      if (v >= 50) return "bg-amber-600";
      return "bg-rose-600";
    }
    return "bg-gradient-to-r from-brand-600 to-brand-500";
  };
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="flex w-36 shrink-0 items-center gap-2 text-sm text-gray-600 truncate">
            {item.icon && (
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600/10">
                <FontAwesomeIcon icon={item.icon} className="w-3 h-3 text-brand-600 shrink-0" />
              </span>
            )}
            <span className="truncate">{item.label}</span>
          </span>
          <div className="h-3 flex-1 rounded-full bg-gray-100 overflow-hidden ring-1 ring-gray-200/50">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${barColor(item.value)}`}
              style={{ width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0) : 0}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-bold text-gray-800 tabular-nums">
            {item.value}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Plain-language reading of whatever the filters currently select. */
function NarrativeCard({
  narrative,
  generatedAt,
  loading,
  error,
  stale,
  show,
  onToggle,
  onGenerate,
}: {
  narrative: AnalyticsNarrative | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  show: boolean;
  onToggle: () => void;
  onGenerate: () => void;
}) {
  const lists = narrative
    ? [
        { title: "Highlights", items: narrative.highlights, dot: "bg-emerald-600" },
        { title: "Watch-outs", items: narrative.watchouts, dot: "bg-amber-600" },
        { title: "Suggested Actions", items: narrative.actions, dot: "bg-brand-600" },
      ].filter((l) => l.items.length > 0)
    : [];

  return (
    <Card padding="md" className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-brand-600/10 p-2">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI Summary</h3>
            <p className="text-xs text-gray-400">
              Reads the figures below for the sections and range you&apos;ve selected
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stale && !loading && (
            <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 sm:inline">
              Filters changed
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            title={show ? "Collapse" : "Expand"}
            className={`flex items-center justify-center rounded-lg border bg-surface px-3 py-2 text-gray-500 transition-colors hover:bg-gray-50 ${show ? "border-gray-300" : "border-brand-600/40 text-brand-600"}`}
          >
            <FontAwesomeIcon
              icon={faChevronUp}
              className={`h-4 w-4 transition-transform ${show ? "" : "rotate-180"}`}
            />
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FontAwesomeIcon
              icon={faArrowsRotate}
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Reading…" : error ? "Retry" : narrative ? "Update" : "Generate"}
          </button>
        </div>
      </div>

      {!show && narrative ? (
        <p className="mt-4 text-sm text-gray-400">AI summary hidden.</p>
      ) : show ? (
        <>
          {error && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          {loading && (
            <div className="mt-4 animate-pulse space-y-2">
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-200" />
              <div className="h-4 w-5/6 rounded bg-gray-200" />
            </div>
          )}

          {!loading && narrative && (
            <div className="mt-4 space-y-4">
              {narrative.headline && (
                <p className="font-display text-lg font-semibold leading-snug text-gray-900">
                  {narrative.headline}
                </p>
              )}
              <p className="text-sm leading-relaxed text-gray-700">{narrative.overview}</p>

              {lists.length > 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {lists.map((list) => (
                    <div key={list.title} className="rounded-xl bg-subtle p-4">
                      <p className="mb-2 text-sm font-semibold text-gray-900">{list.title}</p>
                      <ul className="space-y-2">
                        {list.items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${list.dot}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {generatedAt && (
                <p className="border-t border-hairline pt-3 text-xs text-gray-400">
                  AI-generated {new Date(generatedAt).toLocaleString()} — review before acting on it.
                </p>
              )}
            </div>
          )}

          {!loading && !narrative && !error && (
            <p className="mt-4 text-sm text-gray-400">
              Generate a plain-language reading of the current selection.
            </p>
          )}
        </>
      ) : null}
    </Card>
  );
}

export default function FacultyAnalyticsClient() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [bucket, setBucket] = useState<AnalyticsBucket>("week");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // On-demand ML runs, scoped by the server to this faculty member's sections.
  const [runningMl, setRunningMl] = useState(false);
  const [mlStatus, setMlStatus] = useState<string | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);

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

  /**
   * Runs both jobs, prediction first so the recommender sees fresh risk
   * scores. Stops at the first failure rather than reporting a half-run.
   */
  const handleRunMl = async () => {
    setRunningMl(true);
    setMlError(null);
    setMlStatus(null);

    const predictions = await runFacultyMlJob("predict");
    if (predictions.error) {
      setMlError(predictions.error);
      setRunningMl(false);
      return;
    }
    const recommendations = await runFacultyMlJob("recommend");
    if (recommendations.error) {
      setMlError(recommendations.error);
      setRunningMl(false);
      return;
    }

    const scored = Number(predictions.result?.scored ?? 0);
    const atRisk = Number(predictions.result?.at_risk ?? 0);
    const recs = Number(recommendations.result?.recommendations ?? 0);
    setMlStatus(
      `Scored ${scored} of your students (${atRisk} at risk) and wrote ${recs} recommendation${
        recs === 1 ? "" : "s"
      }. Predictions reach these charts after the warehouse is refreshed.`,
    );
    setRunningMl(false);
  };

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

  /* --- AI narrative -------------------------------------------------- */

  const [showNarrative, setShowNarrative] = useState(true);
  const [narrative, setNarrative] = useState<AnalyticsNarrative | null>(null);
  const [narrativeAt, setNarrativeAt] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  // Which filter combination the current narrative describes, so a stale one
  // is labelled rather than silently describing the wrong numbers.
  const [narrativeKey, setNarrativeKey] = useState<string | null>(null);

  const filterKey = `${[...sectionIds].sort().join(",")}|${from}|${to}`;

  const runNarrative = useCallback(
    async (key: string, ids: string[], start: string, end: string) => {
      setNarrativeLoading(true);
      setNarrativeError(null);
      const result = await generateAnalyticsNarrative({ sectionIds: ids, from: start, to: end });
      setNarrativeLoading(false);
      if (result.error || !result.narrative) {
        setNarrativeError(result.error ?? "Unable to generate summary");
        return;
      }
      setNarrative(result.narrative);
      setNarrativeAt(result.generated_at ?? null);
      setNarrativeKey(key);
    },
    [],
  );

  // One automatic reading on arrival; after that the faculty member asks for
  // it, so changing filters doesn't spend an AI call per click. It waits for
  // the first summary because that request is what heals a cold warehouse —
  // running earlier would narrate zeros. The ref makes every later pass a
  // no-op.
  const autoNarrative = useRef(false);
  useEffect(() => {
    if (loading || autoNarrative.current) return;
    autoNarrative.current = true;
    void (async () => {
      await runNarrative(filterKey, sectionIds, from, to);
    })();
  }, [loading, runNarrative, filterKey, sectionIds, from, to]);

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
            <FontAwesomeIcon icon={faChartBar} className="w-3.5 h-3.5" />
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

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunMl}
              disabled={runningMl || sections.length === 0}
              title={
                sections.length === 0
                  ? "You need at least one section before ML jobs have anyone to run against"
                  : "Score your students for risk and refresh their quiz recommendations"
              }
              className="flex items-center gap-2 rounded-lg border border-brand-600/30 bg-surface px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-600/5 disabled:opacity-50"
            >
              <FontAwesomeIcon
                icon={runningMl ? faSpinner : faBrain}
                spin={runningMl}
                className="h-3.5 w-3.5"
              />
              {runningMl ? "Running…" : "Run ML Jobs"}
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {refreshing && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
              )}
              <span className="tabular-nums">{formatRange(from, to)}</span>
            </div>
          </div>
        </div>

        {(mlStatus || mlError) && (
          <p
            className={`border-t border-hairline px-4 py-2.5 text-xs ${
              mlError ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {mlError ?? mlStatus}
          </p>
        )}

        {sections.length === 0 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-amber-700">
            You don&apos;t manage any sections yet, so there is nothing to report on. An admin
            assigns sections from Admin → Faculty.
          </p>
        )}
      </div>

      <NarrativeCard
        narrative={narrative}
        generatedAt={narrativeAt}
        loading={narrativeLoading}
        error={narrativeError}
        stale={narrativeKey !== null && narrativeKey !== filterKey}
        show={showNarrative}
        onToggle={() => setShowNarrative((v) => !v)}
        onGenerate={() => runNarrative(filterKey, sectionIds, from, to)}
      />

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
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-brand-600/10 p-1.5">
                  <FontAwesomeIcon icon={faChartBar} className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Score Trend</h3>
              </div>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
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
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-lg bg-rose-600/10 p-1.5">
                <FontAwesomeIcon icon={faExclamationTriangle} className="h-3.5 w-3.5 text-rose-600" />
              </div>
              <h3 className="font-semibold text-gray-900">At-Risk Prediction</h3>
            </div>
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
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-lg bg-brand-600/10 p-1.5">
                <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-brand-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Competency Breakdown</h3>
            </div>
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
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-lg bg-brand-600/10 p-1.5">
                <FontAwesomeIcon icon={faHeartbeat} className="h-3.5 w-3.5 text-brand-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Clinical Training Activity</h3>
            </div>
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
