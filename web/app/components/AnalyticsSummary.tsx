"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faWandMagicSparkles, faXmark } from "@fortawesome/free-solid-svg-icons";
import { generateAnalyticsNarrative, type AnalyticsNarrative, type AnalyticsSummary } from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import AiThinking from "./AiThinking";
import { EcgLoader } from "./EcgLoader";

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

/** Shown in turn while the summary is written — it reads the figures below. */
const ANALYTICS_SUMMARY_PHRASES = [
  "Thinking…",
  "Reading the figures…",
  "Analyzing trends…",
  "Comparing sections…",
  "Spotting what stands out…",
  "Drafting the summary…",
];

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

/** The filters a summary was made for. */
export interface SummaryRequest {
  key: string;
  courseId: string | null;
  sectionIds: string[];
  from: string;
  to: string;
}

/**
 * The AI Summary behind a dashboard's button: nothing is generated until it is
 * clicked, and a reading is cached against the figures it describes.
 */
export function useAnalyticsSummary({
  cacheScope,
  summary,
  courseId,
  sectionIds,
  from,
  to,
  extraFigures,
}: {
  /** Whose reading this is: a Dean's is written for a Dean, so it's kept apart. */
  cacheScope: "faculty" | "admin";
  summary: AnalyticsSummary | null;
  courseId: string | null;
  sectionIds: string[];
  from: string;
  to: string;
  /** Any figures the reading covers from beyond the warehouse's summary. */
  extraFigures?: unknown;
}) {
  // Keyed by the numbers themselves rather than the filter selection, so
  // picking a section/range that happens to produce the same figures — or
  // just navigating back to this page — reuses the cached reading instead of
  // spending another (slow) AI call to describe data that hasn't moved.
  const dataSignature = summary
    ? JSON.stringify({
        course: courseId,
        avg: summary.cohort.average_score,
        attempts: summary.cohort.submitted_attempts,
        graded: summary.cohort.graded,
        kinds: summary.cohort.by_kind,
        active: summary.cohort.active_students_30d,
        total: summary.cohort.total_students,
        risk: summary.risk_distribution,
        competency: summary.competency_breakdown,
        // Both keys are undefined on a warehouse that hasn't run migration
        // 030 yet, hence the fallbacks — same as everywhere else these are read.
        top: (summary.top_students ?? []).map((s) => [s.student_key, s.average_score, s.attempts]),
        sections: (summary.sections ?? []).map((s) => [s.id, s.students, s.active_students ?? 0]),
        extra: extraFigures,
      })
    : null;
  const narrativeKey = dataSignature ? `${cacheScope}:analytics:narrative:${dataSignature}` : null;

  // Nothing is generated until the AI Summary button is clicked. The click
  // pins the key and filters it was made for, so a warehouse refresh landing
  // while the popup is open can't quietly start (and pay for) a second call.
  const [request, setRequest] = useState<SummaryRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const loader = useCallback(async () => {
    if (!request) return {};
    const stored = readStoredNarrative(request.key);
    if (stored) return stored;
    const { key, ...filters } = request;
    const result = await generateAnalyticsNarrative(filters);
    if (result.narrative) writeStoredNarrative(key, result);
    return result;
  }, [request]);

  const {
    data: result,
    loading,
    revalidating,
    refresh,
  } = usePageData(request?.key ?? null, loader, {
    freshFor: Infinity,
  });

  const narrative = result?.narrative ?? null;
  const error = result && !result.narrative ? (result.error ?? "Unable to generate summary") : null;
  const busy = loading || revalidating;

  const open = () => {
    if (!narrativeKey) return;
    setIsOpen(true);
    if (request?.key === narrativeKey) {
      // Same figures as last time: show what's held, unless that was a
      // failure — clicking again is a request to try once more.
      if (error && !busy) void refresh();
      return;
    }
    setRequest({ key: narrativeKey, courseId, sectionIds, from, to });
  };

  const close = useCallback(() => setIsOpen(false), []);

  return {
    /** The figures are in, so a reading can be asked for. */
    ready: narrativeKey !== null,
    busy,
    open,
    /** What the open popup shows; null while it is closed. */
    modal:
      isOpen && request
        ? {
            request,
            narrative,
            generatedAt: result?.generated_at ?? null,
            loading: busy,
            error,
            onRetry: () => void refresh(),
            onClose: close,
          }
        : null,
  };
}

/**
 * At the end of the filters' row rather than among them: it reads whatever
 * they select, but isn't itself a filter. Last of all on a phone. Held while a
 * filter change is still loading, so the summary can't be filed under the old
 * figures.
 */
export function AiSummaryButton({
  onClick,
  busy,
  ready,
  waiting,
}: {
  onClick: () => void;
  busy: boolean;
  ready: boolean;
  /** Figures are still arriving. */
  waiting: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready || waiting}
      title={waiting ? "Waiting for the latest figures…" : "Generate a plain-language reading of the current selection"}
      className="order-last flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:order-none sm:ml-auto"
    >
      {busy ? <EcgLoader /> : <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3.5 w-3.5" />}
      AI Summary
    </button>
  );
}

/**
 * Plain-language reading of the figures, in a popup. It only opens on
 * request, so an AI call is spent only when someone actually wants one.
 */
export function AnalyticsSummaryModal({
  narrative,
  generatedAt,
  loading,
  error,
  scope,
  onRetry,
  onClose,
}: {
  narrative: AnalyticsNarrative | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  /** The course, sections and range the summary reads, e.g. "All sections · Jun 1 – Sep 19". */
  scope: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lists = narrative
    ? [
        {
          title: "Highlights",
          items: narrative.highlights,
          dot: "bg-emerald-600",
        },
        {
          title: "Watch-outs",
          items: narrative.watchouts,
          dot: "bg-amber-600",
        },
        {
          title: "Suggested Actions",
          items: narrative.actions,
          dot: "bg-brand-600",
        },
      ].filter((l) => l.items.length > 0)
    : [];

  // Closing mid-generation is fine: the request finishes in the background
  // and reopening picks up its result instead of asking again.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-summary-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2
                id="ai-summary-title"
                className="font-display text-lg font-semibold text-gray-900"
              >
                AI Summary
              </h2>
              <p className="truncate text-sm text-gray-500">{scope}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && !loading && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          {loading && (
            <AiThinking phrases={ANALYTICS_SUMMARY_PHRASES} label="Generating the AI summary" />
          )}

          {!loading && narrative && (
            <div className="space-y-4">
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
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <p className="text-xs text-gray-400">
            {!loading && narrative && generatedAt
              ? `AI-generated ${new Date(generatedAt).toLocaleString()} — review before acting on it.`
              : null}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {error && !loading && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-surface px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
