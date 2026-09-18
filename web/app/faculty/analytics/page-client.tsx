"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartBar,
  faUsers,
  faExclamationTriangle,
  faChevronDown,
  faCheck,
  faLayerGroup,
  faWandMagicSparkles,
  faArrowsRotate,
  faChevronUp,
  faBullseye,
  faTrophy,
  faArrowUp,
  faArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  fetchAnalyticsSummary,
  fetchFacultySections,
  generateAnalyticsNarrative,
  AnalyticsNarrative,
  AnalyticsBucket,
  Section,
} from "../../lib/api";
import {
  SkeletonStatCard,
  SkeletonChartArea,
  SkeletonCompetencyGrid,
} from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import { toast } from "../../components/Toast";
import Card, { CardLabel } from "../../components/Card";
import { usePageData } from "../../lib/use-page-data";
import { MODEL_EVAL_SNAPSHOT, DEFAULT_MODEL_KIND } from "../../lib/model-eval-snapshot";
import { EcgLoader } from "../../components/EcgLoader";
import { Leaderboard } from "./Leaderboard";
import { parseDay, formatRange } from "./dates";
import { buildTrendSeries, TrendLegend, TrendLineChart, TrendTable } from "./SectionTrendChart";

/** Stable empty fallback, so nothing downstream sees a new array each render. */
const NO_SECTIONS: Section[] = [];

// The warehouse ETL can nudge cohort numbers every few minutes with nothing
// meaningfully new to say, so a changed AI-summary data signature waits out
// this cooldown before it's actually spent on a fresh (slow) AI call.
const NARRATIVE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Successful narratives survive a hard refresh (not just client-side nav) via
 * localStorage, keyed by the same data signature as the in-memory cache. A
 * failed generation is deliberately never persisted here — replaying a stale
 * "rate-limited" message after the limit has since cleared would be worse
 * than just trying again. Capped so a semester of filter combinations
 * doesn't grow this without bound.
 */
const NARRATIVE_STORAGE_PREFIX = "icare:analytics-narrative:";
const NARRATIVE_STORAGE_INDEX_KEY = "icare:analytics-narrative:index";
const NARRATIVE_STORAGE_MAX_ENTRIES = 15;

type NarrativeResult = Awaited<ReturnType<typeof generateAnalyticsNarrative>>;

function readStoredNarrative(key: string): NarrativeResult | null {
  try {
    const raw = localStorage.getItem(NARRATIVE_STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as NarrativeResult) : null;
  } catch {
    // Private browsing, disabled storage, or corrupt JSON — just miss the cache.
    return null;
  }
}

function writeStoredNarrative(key: string, result: NarrativeResult) {
  try {
    localStorage.setItem(NARRATIVE_STORAGE_PREFIX + key, JSON.stringify(result));
    const raw = localStorage.getItem(NARRATIVE_STORAGE_INDEX_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [...index.filter((k) => k !== key), key];
    while (next.length > NARRATIVE_STORAGE_MAX_ENTRIES) {
      const evicted = next.shift();
      if (evicted) localStorage.removeItem(NARRATIVE_STORAGE_PREFIX + evicted);
    }
    localStorage.setItem(NARRATIVE_STORAGE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the in-memory cache still covers this tab.
  }
}

/* ---------------------------------------------------------------- dates */

/** Local YYYY-MM-DD. `toISOString()` would shift the day in most timezones. */
function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

/** The same number of days immediately before `from`, for a "vs last period"
 * comparison — mirrors the reference dashboard's KPI cards. */
function previousRange(from: string, to: string): { from: string; to: string } {
  const a = parseDay(from);
  const b = parseDay(to);
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(a);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: isoDay(prevFrom), to: isoDay(prevTo) };
}

/** Percent change, `null` when there's nothing sensible to divide by — the
 * card then shows a dash instead of a misleading 0%/∞%. */
function pctChange(
  curr: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
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

/** Horizontal bars — the correct shape for comparing labelled magnitudes. */
/** Smallest "nice" round number at or above `roughStep` — 1/2/5/10 scaled by
 * magnitude — so evenly-spaced gridlines land on whole numbers (0,1,2,3
 * instead of 0,1,3,4 from naively quartering an arbitrary ceiling). */
function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  for (const step of [1, 2, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= roughStep) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Vertical bar chart — one bar per section, height for its active-student
 * count, with the section's total enrolled shown as a lighter cap and its
 * name below the axis. The actual chart shape "Active Students by Section"
 * asks for, rather than a list of inline progress bars.
 */
function SectionBarChart({
  sections,
}: {
  sections: { id: string; name: string; students: number; active_students?: number }[];
}) {
  const W = 640;
  const H = 260;
  const padL = 36;
  const padR = 12;
  const padT = 28;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = sections.length;
  const maxStudents = Math.max(1, ...sections.map((s) => s.students));
  const step = niceStep(maxStudents / 4);
  const ceiling = step * Math.ceil(maxStudents / step);
  const ticks: number[] = [];
  for (let t = 0; t <= ceiling; t += step) ticks.push(t);
  const y = (v: number) => padT + (1 - v / ceiling) * plotH;

  const barGap = 28;
  const barW = Math.min(64, (plotW - barGap * Math.max(n - 1, 0)) / Math.max(n, 1));
  const rowW = barW * n + barGap * Math.max(n - 1, 0);
  const startX = padL + Math.max(0, (plotW - rowW) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            y1={y(t)}
            x2={W - padR}
            y2={y(t)}
            className="stroke-gray-200"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 8}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="10"
            className="fill-gray-400 tabular-nums"
          >
            {t}
          </text>
        </g>
      ))}

      {sections.map((s, i) => {
        const active = s.active_students ?? 0;
        const x = startX + i * (barW + barGap);
        const totalY = y(s.students);
        const activeY = y(active);
        return (
          <g key={s.id}>
            {/* Total enrolled — a faint track behind the active bar, same
                role as the gray-100 track other bars on this page use. */}
            <rect
              x={x}
              y={totalY}
              width={barW}
              height={Math.max(0, padT + plotH - totalY)}
              rx={6}
              className="fill-gray-100"
            />
            <rect
              x={x}
              y={activeY}
              width={barW}
              height={Math.max(0, padT + plotH - activeY)}
              rx={6}
              className="fill-brand-500 transition-all duration-700 ease-out"
            >
              <title>{`${s.name}: ${active} active of ${s.students} enrolled`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={H - padB + 18}
              textAnchor="middle"
              fontSize="11"
              className="fill-gray-400"
            >
              {s.name.length > 10 ? `${s.name.slice(0, 9)}…` : s.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Wraps a label into at most two lines, breaking on words. SVG has no text
 * wrapping of its own, and competency names run long enough ("Safe and
 * Quality Nursing Care") that a single truncated line says nothing.
 */
function wrapLabel(label: string, perLine = 14, maxLines = 2): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of label.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= perLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && current && lines[maxLines - 1] !== current) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, perLine - 1)}…`;
  }
  return lines;
}

/**
 * Vertical bar chart — one bar per competency, height for its average score.
 *
 * Replaces the inline progress bars this panel used to draw. The axis is
 * pinned to 0–100 rather than scaled to the highest score: these are
 * percentages, and letting the best competency fill the plot would make 60%
 * read as mastery. Colours are the same grade thresholds the rest of the
 * page uses, so a red bar means the same thing here as anywhere else.
 */
function CompetencyBarChart({ items }: { items: { key: string; label: string; value: number }[] }) {
  // The card is half the page wide, and a viewBox scales its text along with
  // the box: at 640 the labels rendered around 5px. Narrower box, same fonts.
  const W = 1000;
  const H = 300;
  const padL = 36;
  const padR = 12;
  const padT = 24;
  const padB = 60;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = items.length;

  const ticks = [0, 25, 50, 75, 100];
  const y = (v: number) => padT + (1 - v / 100) * plotH;

  const barGap = n > 6 ? 12 : 24;
  const barW = Math.min(56, (plotW - barGap * Math.max(n - 1, 0)) / Math.max(n, 1));
  const rowW = barW * n + barGap * Math.max(n - 1, 0);
  const startX = padL + Math.max(0, (plotW - rowW) / 2);

  const fillFor = (v: number) => {
    if (v >= 75) return "fill-emerald-600";
    if (v >= 50) return "fill-amber-600";
    return "fill-rose-600";
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            y1={y(t)}
            x2={W - padR}
            y2={y(t)}
            className="stroke-gray-200"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 8}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="10"
            className="fill-gray-400 tabular-nums"
          >
            {t}
          </text>
        </g>
      ))}

      {items.map((item, i) => {
        const x = startX + i * (barW + barGap);
        const barY = y(item.value);
        return (
          <g key={item.key}>
            {/* Faint full-height track, the same device the other bars on
                this page use to show the distance left to 100%. */}
            <rect x={x} y={padT} width={barW} height={plotH} rx={6} className="fill-gray-100" />
            <rect
              x={x}
              y={barY}
              width={barW}
              height={Math.max(0, padT + plotH - barY)}
              rx={6}
              className={`${fillFor(item.value)} transition-all duration-700 ease-out`}
            >
              <title>{`${item.label}: ${item.value}%`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={barY - 6}
              textAnchor="middle"
              fontSize="11"
              className="fill-gray-700 font-semibold tabular-nums"
            >
              {item.value}%
            </text>
            {wrapLabel(item.label).map((line, li) => (
              <text
                key={line + li}
                x={x + barW / 2}
                y={H - padB + 16 + li * 12}
                textAnchor="middle"
                fontSize="10"
                className="fill-gray-400"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * KPI tile with a label + icon header, a large value, and a "vs last period"
 * trend badge — the shape of the reference dashboard's cards, sized to fill
 * its grid cell rather than hugging its content.
 */
function KpiCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  change,
  comparisonLabel,
  /** Whether an increasing value is the good outcome (revenue, scores) or
   * the bad one (at-risk count) — flips which direction is colored green. */
  goodDirection = "up",
}: {
  label: string;
  value: string;
  icon: IconDefinition;
  iconBg: string;
  iconColor: string;
  change: number | null;
  comparisonLabel: string;
  goodDirection?: "up" | "down";
}) {
  const isUp = (change ?? 0) >= 0;
  const isGood = change == null ? null : goodDirection === "up" ? isUp : !isUp;
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-surface p-4 shadow-tile">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs font-bold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}
        >
          <FontAwesomeIcon icon={icon} className="h-11 w-11" />
        </span>
      </div>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums text-gray-900">{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        {change != null ? (
          <span
            className={`flex items-center gap-1 font-semibold ${isGood ? "text-emerald-600" : "text-rose-600"}`}
          >
            <FontAwesomeIcon icon={isUp ? faArrowUp : faArrowDown} className="h-2.5 w-2.5" />
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : (
          <span className="font-semibold text-gray-400">—</span>
        )}
        <span className="text-gray-400">{comparisonLabel}</span>
      </div>
    </div>
  );
}

/** Plain-language reading of whatever the filters currently select. */
function NarrativeCard({
  narrative,
  generatedAt,
  loading,
  error,
  pendingUpdate,
  show,
  onToggle,
  onGenerate,
}: {
  narrative: AnalyticsNarrative | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  /** Newer data has arrived but the summary is holding off a beat rather
   * than spending an AI call on every minor warehouse tick. */
  pendingUpdate: boolean;
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
          {!loading && !error && (pendingUpdate || narrative) && (
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex ${
                pendingUpdate ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              <FontAwesomeIcon
                icon={pendingUpdate ? faArrowsRotate : faCheck}
                className="h-2.5 w-2.5"
              />
              {pendingUpdate ? "New data available" : "No changes since last summary"}
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
            disabled={loading || (!pendingUpdate && !error && Boolean(narrative))}
            title={
              !loading && !pendingUpdate && !error && narrative
                ? "No new data yet — regenerating now would spend the same (limited) AI quota on a near-identical answer."
                : undefined
            }
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <EcgLoader />
            ) : (
              <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
            )}
            {loading
              ? "Reading…"
              : error
                ? "Retry"
                : pendingUpdate
                  ? "Refresh now"
                  : narrative
                    ? "Up to date"
                    : "Generate"}
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
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${list.dot}`}
                            />
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
                  AI-generated {new Date(generatedAt).toLocaleString()} — review before acting on
                  it.
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
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetId>("3m");
  // Lazily initialised so `new Date()` never runs during a server render —
  // the first paint is the skeleton, so there is nothing to mismatch.
  const [range, setRange] = useState<{ from: string; to: string }>(() => rangeForPreset("3m"));
  // What the custom date inputs show. Kept separate from `range` (the applied
  // query) so a half-typed or inverted range doesn't fire a request, while the
  // controlled inputs still track every keystroke.
  const [draft, setDraft] = useState<{ from: string; to: string }>(() => rangeForPreset("3m"));

  const { data: sectionsData } = usePageData("faculty:sections", fetchFacultySections);
  const sections = sectionsData ?? NO_SECTIONS;

  const { from, to } = range;
  const sectionKey = [...sectionIds].sort().join(",");

  // One entry per filter combination. A late response lands on its own key
  // rather than on whatever the user has since selected, which is what the
  // abort controller here used to be for; and re-selecting a range already
  // looked at costs nothing.
  const {
    data: analytics,
    loading,
    revalidating: refreshing,
  } = usePageData(
    `faculty:analytics:${sectionKey}:${from}:${to}`,
    () => fetchAnalyticsSummary({ sectionIds, from, to, sectionTrend: true }),
    { keepPreviousData: true },
  );

  const summary = analytics?.summary ?? null;
  const bucket = analytics?.bucket ?? "week";

  // A second, quieter fetch for the immediately preceding period of equal
  // length, purely to power each KPI card's "vs last period" badge.
  const prevRangeValue = useMemo(() => previousRange(from, to), [from, to]);
  const { data: prevAnalytics } = usePageData(
    `faculty:analytics:prev:${sectionKey}:${prevRangeValue.from}:${prevRangeValue.to}`,
    () => fetchAnalyticsSummary({ sectionIds, from: prevRangeValue.from, to: prevRangeValue.to }),
    { keepPreviousData: true },
  );
  const prevSummary = prevAnalytics?.summary ?? null;

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
  // The table carries the same numbers as the performance chart, for readers
  // who can't hover or can't tell the lighter section colours apart.
  const [trendView, setTrendView] = useState<"chart" | "table">("chart");

  // Keyed by the numbers themselves rather than the filter selection, so
  // picking a section/range that happens to produce the same figures — or
  // just navigating back to this page — reuses the cached reading instead of
  // spending another (slow) AI call to describe data that hasn't moved.
  const dataSignature = summary
    ? JSON.stringify({
        avg: summary.cohort.average_score,
        attempts: summary.cohort.submitted_attempts,
        active: summary.cohort.active_students_30d,
        total: summary.cohort.total_students,
        risk: summary.risk_distribution,
        competency: summary.competency_breakdown,
        // Both keys are undefined on a warehouse that hasn't run migration
        // 030 yet, hence the fallbacks — same as everywhere else these are read.
        top: (summary.top_students ?? []).map((s) => [s.student_key, s.average_score, s.attempts]),
        sections: (summary.sections ?? []).map((s) => [s.id, s.students, s.active_students ?? 0]),
      })
    : null;
  const narrativeKey = dataSignature ? `faculty:analytics:narrative:${dataSignature}` : null;

  // The warehouse ETL can nudge these numbers every few minutes with nothing
  // meaningfully new to say, so a changed signature doesn't switch the AI
  // summary over immediately — only after a cooldown, so a session left open
  // doesn't spend a slow AI call on every minor tick. `activeNarrativeKey` is
  // what's actually handed to usePageData; `narrativeKey` above is just
  // "what the data looks like right now."
  const [activeNarrativeKey, setActiveNarrativeKey] = useState<string | null>(null);
  const lastAutoSwitchAt = useRef(0);

  useEffect(() => {
    if (narrativeKey === null || narrativeKey === activeNarrativeKey) return;
    const elapsed = Date.now() - lastAutoSwitchAt.current;
    if (activeNarrativeKey === null || elapsed >= NARRATIVE_COOLDOWN_MS) {
      lastAutoSwitchAt.current = Date.now();
      setActiveNarrativeKey(narrativeKey);
    }
    // Otherwise leave the older key active; `pendingUpdate` below surfaces
    // that newer data exists, and Regenerate can always jump the cooldown.
  }, [narrativeKey, activeNarrativeKey]);

  const pendingUpdate = narrativeKey !== null && narrativeKey !== activeNarrativeKey;

  const narrativeLoader = useCallback(async () => {
    if (activeNarrativeKey) {
      const stored = readStoredNarrative(activeNarrativeKey);
      if (stored) return stored;
    }
    const result = await generateAnalyticsNarrative({ sectionIds, from, to });
    if (activeNarrativeKey && result.narrative) writeStoredNarrative(activeNarrativeKey, result);
    return result;
  }, [activeNarrativeKey, sectionIds, from, to]);

  const {
    data: narrativeResult,
    loading: narrativeLoading,
    revalidating: narrativeRevalidating,
    refresh: reloadActiveNarrative,
  } = usePageData(activeNarrativeKey, narrativeLoader, {
    freshFor: Infinity,
    keepPreviousData: true,
  });

  const narrative = narrativeResult?.narrative ?? null;
  const narrativeAt = narrativeResult?.generated_at ?? null;
  const narrativeError =
    narrativeResult && !narrativeResult.narrative
      ? (narrativeResult.error ?? "Unable to generate summary")
      : null;
  const narrativeBusy = narrativeLoading || narrativeRevalidating;

  // Pending data jumps the cooldown, and a failed attempt is always worth
  // retrying — both are real reasons to spend another AI call. Clicking this
  // with neither reason true would just re-ask about numbers we already have
  // a good answer for, burning the same (limited) quota for a near-identical
  // reply, so that case is a no-op instead.
  const regenerateNarrative = () => {
    if (pendingUpdate) {
      lastAutoSwitchAt.current = Date.now();
      setActiveNarrativeKey(narrativeKey);
    } else if (narrativeError) {
      void reloadActiveNarrative();
    } else {
      toast("No new data yet — this summary is already current.", "info");
    }
  };

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
  const trendSeries = buildTrendSeries(summary, sections);
  // The split failed to load (the summary itself did) — say so rather than
  // drawing one merged line in its place.
  const trendUnavailable = summary != null && summary.section_trend == null;
  const competencies = Object.entries(summary?.competency_breakdown ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const topStudents = summary?.top_students ?? [];
  // The card shows the podium and a little more; the full ranking opens on
  // its own page with the same scope, so it lists the same students in order.
  const leaderboardHref = `/faculty/analytics/leaderboard?${new URLSearchParams({
    ...(sectionIds.length > 0 ? { sections: sectionIds.join(",") } : {}),
    from,
    to,
  })}`;
  const sectionsWithActivity = summary?.sections ?? [];

  // No ground-truth outcome column exists to score live predictions against,
  // so accuracy is a shipped offline-eval snapshot, labelled with whichever
  // model actually issued the most recent risk labels.
  const modelKind = summary?.active_model?.kind ?? DEFAULT_MODEL_KIND;
  const modelEval = MODEL_EVAL_SNAPSHOT[modelKind] ?? MODEL_EVAL_SNAPSHOT[DEFAULT_MODEL_KIND];

  const prevAtRisk = prevSummary?.risk_distribution?.at_risk ?? null;
  const comparisonLabel = `vs ${formatRange(prevRangeValue.from, prevRangeValue.to)}`;

  const statCards = [
    {
      icon: faChartBar,
      value: summary?.cohort.average_score != null ? `${summary.cohort.average_score}%` : "—",
      label: "Average Student Performance",
      change: pctChange(summary?.cohort.average_score, prevSummary?.cohort.average_score),
      comparisonLabel,
      goodDirection: "up" as const,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: faUsers,
      value: `${summary?.cohort.active_students_30d ?? 0}/${summary?.cohort.total_students ?? 0}`,
      label: "Active Students",
      change: pctChange(
        summary?.cohort.active_students_30d,
        prevSummary?.cohort.active_students_30d,
      ),
      comparisonLabel,
      goodDirection: "up" as const,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      icon: faExclamationTriangle,
      value: `${atRisk}`,
      label: "Students At-Risk",
      change: pctChange(atRisk, prevAtRisk),
      comparisonLabel,
      // Rising at-risk counts are the bad direction, unlike every other card.
      goodDirection: "down" as const,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      icon: faBullseye,
      value: `${Math.round(modelEval.accuracy * 100)}%`,
      label: "Prediction Accuracy",
      change: null,
      comparisonLabel: `${modelEval.model} · offline eval`,
      goodDirection: "up" as const,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
    },
  ];

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faChartBar} className="w-3.5 h-3.5" />,
          label: "Warehouse Analytics",
        }}
        title="Analytics"
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
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {refreshing && <EcgLoader size="xs" className="text-brand-600" />}
              <span className="tabular-nums">{formatRange(from, to)}</span>
            </div>
          </div>
        </div>

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
        loading={narrativeBusy}
        error={narrativeError}
        pendingUpdate={pendingUpdate}
        show={showNarrative}
        onToggle={() => setShowNarrative((v) => !v)}
        onGenerate={regenerateNarrative}
      />

      {/* Refetches dim the panels in place rather than tearing the page down
          to skeletons, so changing a filter doesn't make the layout jump. */}
      <div className={`transition-opacity duration-200 ${refreshing ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 items-stretch">
          {statCards.map((card) => (
            <KpiCard
              key={card.label}
              icon={card.icon}
              value={card.value}
              label={card.label}
              change={card.change}
              comparisonLabel={card.comparisonLabel}
              goodDirection={card.goodDirection}
              iconBg={card.iconBg}
              iconColor={card.iconColor}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
          <Card padding="md" className="flex flex-col lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-brand-600/10 p-2.5">
                  <FontAwesomeIcon icon={faChartBar} className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Classroom Performance Overview</h3>
                  <p className="text-xs text-gray-400">
                    {trendSeries.length === 1
                      ? `Average quiz score over time — ${trendSeries[0].name}`
                      : "Average quiz score over time, one line per section"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {BUCKET_LABEL[bucket]}
                </span>
                {trendSeries.length > 0 && (
                  <div
                    className="flex rounded-lg border border-hairline p-0.5"
                    role="group"
                    aria-label="View"
                  >
                    {(["chart", "table"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setTrendView(view)}
                        aria-pressed={trendView === view}
                        className={`rounded-md px-2 py-0.5 text-xs capitalize transition-colors ${
                          trendView === view
                            ? "bg-brand-600 text-white"
                            : "text-gray-500 hover:bg-subtle hover:text-gray-900"
                        }`}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              {trendUnavailable ? (
                <p className="text-gray-400 text-sm py-16 text-center">
                  The per-section breakdown couldn&apos;t be loaded. Refresh to try again.
                </p>
              ) : trendSeries.length === 0 ? (
                <p className="text-gray-400 text-sm py-16 text-center">
                  No submitted attempts in {formatRange(from, to)}.
                </p>
              ) : trendView === "table" ? (
                <TrendTable series={trendSeries} bucket={bucket} />
              ) : (
                <>
                  <TrendLegend series={trendSeries} />
                  <TrendLineChart series={trendSeries} bucket={bucket} />
                </>
              )}
            </div>
          </Card>

          <Card padding="md" className="flex flex-col">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-xl bg-amber-500/10 p-2.5">
                <FontAwesomeIcon icon={faTrophy} className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Top Performing Students</h3>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <Leaderboard students={topStudents.slice(0, 7)} />
            </div>
            {topStudents.length > 0 && (
              <div className="mt-4 flex justify-end border-t border-hairline pt-3">
                <Link
                  href={leaderboardHref}
                  className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  View full leaderboard →
                </Link>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-4 mb-4 items-stretch">
          <Card padding="md" className="flex flex-col">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="rounded-xl bg-brand-600/10 p-2.5">
                <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Performance per Competency</h3>
                <p className="text-xs text-gray-400">Bar chart — average score by competency</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              {competencies.length === 0 ? (
                <p className="text-gray-400 text-sm py-12 text-center">
                  No validated competency scores yet — record them from each student&apos;s profile.
                </p>
              ) : (
                <CompetencyBarChart
                  items={competencies.map(([name, value]) => ({ key: name, label: name, value }))}
                />
              )}
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
