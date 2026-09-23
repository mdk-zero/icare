"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faBolt,
  faWandMagicSparkles,
  faCircleCheck,
  faClipboardCheck,
  faChartLine,
  faClipboardList,
  faClock,
  faShieldHalved,
  faTriangleExclamation,
  faStethoscope,
  faListCheck,
  faFileLines,
  faXmark,
  faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";
import {
  resolveCompetencies,
  COMPETENCY_LEVEL_LABEL,
  COMPETENCY_LEVEL_TONE,
  COMPETENCY_LEVEL_BAR,
  type ResolvedCompetency,
} from "../../../lib/competency";
import {
  fetchFacultyStudentDetail,
  fetchLatestPrediction,
  logAuditAction,
  getCurrentFacultyUser,
  fetchStudentScenarioHistory,
  fetchCompetencyScores,
  generateStudentSummary,
  CompetencyScore,
  type ScenarioPerformance,
  type StudentQuizAttempt,
} from "../../../lib/api";
import { scoreDescriptor } from "../../../lib/task-ratings";
import { SkeletonProfileHeader, SkeletonRiskPredictionCard, SkeletonTabContent } from "../../../components/skeletons";
import Card from "../../../components/Card";
import Avatar from "../../../components/Avatar";
import StatTile from "../../../components/StatTile";
import { usePageData } from "../../../lib/use-page-data";
import LiveClock from "../../../components/LiveClock";
import AiThinking from "../../../components/AiThinking";

/** Shown in turn while the summary is written, following what it draws on. */
const STUDENT_SUMMARY_PHRASES = [
  "Thinking…",
  "Reviewing quiz scores…",
  "Going through scenarios…",
  "Analyzing competencies…",
  "Checking the risk prediction…",
  "Drafting recommendations…",
];

/**
 * One slot per student, surviving a hard refresh via localStorage. Each entry
 * remembers the data signature it was generated for, so opening the modal
 * can tell whether the student's quizzes/scenarios/competencies/risk
 * prediction have moved on since. A failed generation is never persisted, so
 * a retry after a transient error or rate limit tries again instead of
 * replaying the failure. Capped so a semester-long roster doesn't grow this
 * without bound.
 */
const SUMMARY_STORAGE_PREFIX = "icare:student-summary:";
const SUMMARY_STORAGE_INDEX_KEY = "icare:student-summary:index";
const SUMMARY_STORAGE_MAX_ENTRIES = 100;
/** How often figures that have changed are allowed to spend a new AI call. */
const SUMMARY_REFRESH_THROTTLE_MS = 10 * 60 * 1000;

type SummaryResult = Awaited<ReturnType<typeof generateStudentSummary>>;

interface StoredSummary {
  signature: string;
  result: SummaryResult;
}

function readStoredSummary(studentId: string): StoredSummary | null {
  try {
    const raw = localStorage.getItem(SUMMARY_STORAGE_PREFIX + studentId);
    return raw ? (JSON.parse(raw) as StoredSummary) : null;
  } catch {
    // Private browsing, disabled storage, or corrupt JSON — just miss the cache.
    return null;
  }
}

function writeStoredSummary(studentId: string, entry: StoredSummary) {
  try {
    localStorage.setItem(SUMMARY_STORAGE_PREFIX + studentId, JSON.stringify(entry));
    const raw = localStorage.getItem(SUMMARY_STORAGE_INDEX_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [...index.filter((id) => id !== studentId), studentId];
    while (next.length > SUMMARY_STORAGE_MAX_ENTRIES) {
      const evicted = next.shift();
      if (evicted) localStorage.removeItem(SUMMARY_STORAGE_PREFIX + evicted);
    }
    localStorage.setItem(SUMMARY_STORAGE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the in-memory cache still covers this tab.
  }
}

// Stable empty fallbacks, so nothing downstream sees a new array each render.
const NO_PERFORMANCE_HISTORY: StudentQuizAttempt[] = [];
const NO_SCENARIO_HISTORY: ScenarioPerformance[] = [];
const NO_COMPETENCIES: ResolvedCompetency[] = [];
const NO_SCORE_HISTORY: CompetencyScore[] = [];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A duration in seconds, read as a person would say it. */
function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

/**
 * Plain-language reading of this student's record, in a popup opened from
 * the profile card. It only opens on request, so an AI call is spent only
 * when someone actually wants one.
 */
function StudentSummaryModal({
  studentName,
  summary,
  generatedAt,
  loading,
  error,
  stale,
  onRetry,
  onClose,
}: {
  studentName: string;
  summary: NonNullable<SummaryResult["summary"]> | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  /** True when newer activity exists but the 10-minute cooldown held this back. */
  stale: boolean;
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

  const lists = summary
    ? [
        { title: "Strengths", items: summary.strengths, dot: "bg-emerald-600" },
        {
          title: "Areas for Improvement",
          items: summary.areas_for_improvement,
          dot: "bg-amber-600",
        },
        { title: "Recommendations", items: summary.recommendations, dot: "bg-brand-600" },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-summary-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon
                icon={faWandMagicSparkles}
                className="h-4 w-4 text-brand-600"
              />
            </span>
            <div className="min-w-0">
              <h2
                id="student-summary-title"
                className="font-display text-lg font-semibold text-gray-900"
              >
                AI Performance Summary
              </h2>
              <p className="truncate text-sm text-gray-500">{studentName}</p>
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
            <AiThinking
              phrases={STUDENT_SUMMARY_PHRASES}
              label="Generating the AI performance summary"
            />
          )}

          {!loading && summary && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-gray-700">{summary.overview}</p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {lists.map((list) => (
                  <div key={list.title} className="rounded-xl bg-subtle p-4">
                    <p className="mb-2 text-sm font-semibold text-gray-900">{list.title}</p>
                    {list.items.length === 0 ? (
                      <p className="text-sm text-gray-400">Nothing noted.</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-600"
                          >
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${list.dot}`}
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <p className="text-xs text-gray-400">
            {!loading && summary && generatedAt
              ? `AI-generated ${new Date(generatedAt).toLocaleString()} — review before acting on it.${
                  stale
                    ? " Newer activity is on the way in — this refreshes automatically once the 10-minute cooldown clears."
                    : ""
                }`
              : null}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {error && !loading && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                <FontAwesomeIcon
                  icon={faArrowsRotate}
                  className="h-3.5 w-3.5"
                />
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

export default function StudentDetailClient() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.id as string;
  
  const [activeTab, setActiveTab] = useState("performance");
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!studentId || loggedRef.current) return;
    loggedRef.current = true;
    const faculty = getCurrentFacultyUser();
    if (faculty) {
      logAuditAction({
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        tab: 'student_detail',
        action: 'view_student',
        details: `Viewed student detail page`,
        target_type: 'student',
        target_id: studentId,
      });
    }
  }, [studentId]);

  // Keyed by student, so stepping back to the roster and into the same student
  // again reads the whole profile from memory.
  const { data, loading } = usePageData(
    studentId ? `faculty:student:${studentId}` : null,
    async () => {
      const [detail, riskPrediction, scenarioHistory, scoreHistory] = await Promise.all([
        fetchFacultyStudentDetail(studentId),
        fetchLatestPrediction(studentId),
        fetchStudentScenarioHistory(studentId),
        fetchCompetencyScores(studentId),
      ]);

      return {
        student: detail?.student ?? null,
        performanceHistory: detail?.performance_history ?? NO_PERFORMANCE_HISTORY,
        riskPrediction,
        scenarioHistory,
        scoreHistory,
        // A faculty validation outranks a quiz result; assessment-derived scores
        // fill every competency nobody has reviewed by hand.
        competencies: resolveCompetencies(scoreHistory),
      };
    },
  );

  const student = data?.student ?? null;
  const performanceHistory = data?.performanceHistory ?? NO_PERFORMANCE_HISTORY;
  const scenarioHistory = data?.scenarioHistory ?? NO_SCENARIO_HISTORY;
  const competencies = data?.competencies ?? NO_COMPETENCIES;
  const scoreHistory = data?.scoreHistory ?? NO_SCORE_HISTORY;
  const riskPrediction = data?.riskPrediction ?? null;

  /* --- AI summary ------------------------------------------------------ */

  // A signature of the figures the summary would describe. Reopening the
  // modal for a profile whose quizzes, scenarios, competencies, and risk
  // prediction haven't changed reuses the cached reading instead of spending
  // another AI call to describe activity that hasn't moved.
  const summaryDataSignature = data
    ? JSON.stringify({
        quizzes: performanceHistory.map((h) => [h.quiz_title, h.score, h.submitted_at]),
        scenarios: scenarioHistory.map((s) => [s.id, s.score, s.completed_at]),
        competencies: scoreHistory.map((c) => [c.competency_id, c.score, c.source, c.created_at]),
        risk: riskPrediction
          ? [riskPrediction.risk, riskPrediction.probability, riskPrediction.predicted_at]
          : null,
      })
    : null;

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  // True when the figures have moved on since this reading was generated,
  // but the 10-minute cooldown held back a new AI call for it.
  const [summaryStale, setSummaryStale] = useState(false);

  // Opens the modal and, unless a cached reading already covers the current
  // figures (or the last real call was under 10 minutes ago), spends one AI
  // call to write a fresh one. Runs every time the button is clicked, not
  // just the first, so activity from later in the session is picked up.
  // `force` skips the cache/cooldown check entirely — used to retry after an
  // error, so it can't silently resurface an unrelated stale reading instead.
  const requestSummary = (opts?: { force?: boolean }) => {
    setSummaryOpen(true);
    if (!summaryDataSignature) return;

    const stored = opts?.force ? null : readStoredSummary(studentId);
    if (stored) {
      const sameData = stored.signature === summaryDataSignature;
      const generatedAtMs = stored.result.generated_at
        ? new Date(stored.result.generated_at).getTime()
        : 0;
      const withinThrottle = Date.now() - generatedAtMs < SUMMARY_REFRESH_THROTTLE_MS;
      if (sameData || withinThrottle) {
        setSummaryResult(stored.result);
        setSummaryStale(!sameData);
        setSummaryLoading(false);
        return;
      }
    }

    setSummaryLoading(true);
    setSummaryStale(false);
    void (async () => {
      const result = await generateStudentSummary(studentId);
      setSummaryLoading(false);
      setSummaryResult(result);
      if (result.summary) {
        writeStoredSummary(studentId, { signature: summaryDataSignature, result });
        const faculty = getCurrentFacultyUser();
        if (faculty) {
          logAuditAction({
            faculty_id: faculty.id,
            faculty_name: faculty.name,
            tab: 'student_detail',
            action: 'generate_student_summary',
            details: 'Generated AI performance summary',
            target_type: 'student',
            target_id: studentId,
          });
        }
      }
    })();
  };

  const closeSummary = useCallback(() => setSummaryOpen(false), []);

  const aiSummary = summaryResult?.summary ?? null;
  const summaryGeneratedAt = summaryResult?.generated_at ?? null;
  const summaryError =
    summaryResult && !summaryResult.summary
      ? (summaryResult.error ?? "Unable to generate summary")
      : null;

  const featureLabel = (feature: string) =>
    feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const needsImprovement = competencies.filter((c) => c.level === 'needs_improvement');

  if (loading) {
    return (
      <div>
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SkeletonProfileHeader />
          </div>
          <SkeletonRiskPredictionCard />
        </div>
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden animate-pulse">
          <div className="border-b border-hairline">
            <div className="flex gap-4 px-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="py-4">
                  <div className="h-4 w-20 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="p-6">
            <SkeletonTabContent />
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-gray-500">Student not found</p>
        <button 
          onClick={() => router.push('/faculty/students')}
          className="mt-4 px-4 py-2 text-brand-600 font-medium"
        >
          Back to Students
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <button 
          onClick={() => router.push('/faculty/students')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="w-5 h-5" />
          Back to Students
        </button>
        <LiveClock variant="compact" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Card padding="sm" className="flex h-full flex-col">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar
                  name={student.name}
                  src={student.picture_url}
                  userId={student.id}
                  sex={student.sex}
                  size="xl"
                  tone="solid"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                  <p className="text-gray-500">{student.email}</p>
                  <div className="flex items-center gap-2">
                    {student.section ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 border border-brand-600/20">
                        Section {student.section}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                        No section
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => requestSummary()}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-[0_2px_6px_rgba(27,107,123,0.2)] transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" />
                AI Summary
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 gap-3">
              <StatTile
                icon={faChartLine}
                iconBg="bg-brand-600/10"
                iconColor="text-brand-600"
                value={student.average_score != null ? `${student.average_score}%` : "—"}
                label="Avg Score"
              />
              <StatTile
                icon={faClipboardList}
                iconBg="bg-purple-50"
                iconColor="text-purple-600"
                value={String(student.quiz_count ?? 0)}
                label="Quizzes"
              />
              <StatTile
                icon={faClock}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                value={
                  student.last_activity
                    ? new Date(student.last_activity).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "Never"
                }
                label="Last Active"
              />
              <StatTile
                icon={
                  !riskPrediction
                    ? faShieldHalved
                    : riskPrediction.risk === "at_risk"
                      ? faTriangleExclamation
                      : faShieldHalved
                }
                iconBg={
                  !riskPrediction
                    ? "bg-gray-100"
                    : riskPrediction.risk === "at_risk"
                      ? "bg-red-50"
                      : "bg-emerald-50"
                }
                iconColor={
                  !riskPrediction
                    ? "text-gray-500"
                    : riskPrediction.risk === "at_risk"
                      ? "text-red-600"
                      : "text-emerald-600"
                }
                value={riskPrediction ? (riskPrediction.risk === "at_risk" ? "At Risk" : "Safe") : "Not Scored"}
                valueColor={
                  !riskPrediction
                    ? "text-gray-500"
                    : riskPrediction.risk === "at_risk"
                      ? "text-red-600"
                      : "text-emerald-600"
                }
                label="Risk Status"
              />
            </div>
          </Card>
        </div>

        <Card padding="sm" className="h-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FontAwesomeIcon icon={faBolt} className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">At-Risk Prediction</h3>
          </div>

          {!riskPrediction ? (
            <p className="text-sm text-gray-500 py-4">
              No prediction yet — the ML service scores the cohort nightly
              (or run it from Admin &gt; Analytics).
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Classification</span>
                <span className={`font-medium ${riskPrediction.risk === 'at_risk' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {riskPrediction.risk === 'at_risk' ? 'AT RISK' : 'SAFE'}
                </span>
              </div>
              {riskPrediction.probability != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-500">Risk Probability</span>
                    <span className="font-medium text-gray-900">
                      {Math.round(riskPrediction.probability * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${riskPrediction.risk === 'at_risk' ? 'bg-red-600' : 'bg-emerald-600'}`}
                      style={{ width: `${Math.round(riskPrediction.probability * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {riskPrediction.explanations.length > 0 && (
                <div className="border-t border-hairline pt-3">
                  <p className="text-sm text-gray-500 mb-2">Top Contributing Factors</p>
                  <div className="space-y-2">
                    {riskPrediction.explanations.map((exp) => (
                      <div key={exp.feature} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${exp.direction === 'increases_risk' ? 'bg-red-600' : 'bg-emerald-600'}`} />
                          <span className="text-gray-600">{featureLabel(exp.feature)}</span>
                        </div>
                        <span className="text-gray-500">
                          {exp.value} <span className="text-gray-400">(avg {exp.cohort_mean})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {riskPrediction.features.evidence_weight != null && riskPrediction.features.evidence_weight < 1 && (
                <p className="text-xs text-gray-500">
                  {riskPrediction.features.attempts_count
                    ? `Only ${riskPrediction.features.attempts_count} graded ${riskPrediction.features.attempts_count === 1 ? 'quiz' : 'quizzes'} so far, so this rating leans on missed deadlines until there are 3.`
                    : 'No graded quizzes yet, so this rating is based on missed deadlines rather than scores.'}
                </p>
              )}
              <p className="text-xs text-gray-400 border-t border-hairline pt-3">
                {riskPrediction.ml_models
                  ? `${riskPrediction.ml_models.kind.replace(/_/g, ' ')} v${riskPrediction.ml_models.version}${riskPrediction.ml_models.is_baseline ? ' (pre-trained baseline)' : ''}`
                  : 'model unknown'}
                {' · '}
                {new Date(riskPrediction.predicted_at).toLocaleString()}
              </p>
            </div>
          )}
        </Card>
      </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            { key: 'performance', label: 'Performance', hint: 'Quiz results', count: performanceHistory.length, unit: 'quizzes', icon: faChartLine },
            { key: 'scenarios', label: 'Scenarios', hint: 'Simulation runs', count: scenarioHistory.length, unit: 'runs', icon: faStethoscope },
            { key: 'competencies', label: 'Competencies', hint: 'Skill mastery', count: competencies.length, unit: 'areas', icon: faListCheck },
          ] as const).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={active}
                className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                  active
                    ? 'border-[#1b6b7b] bg-gradient-to-br from-[#1b6b7b] to-[#124a52] text-white shadow-[0_8px_20px_-6px_rgba(27,107,123,0.5)]'
                    : 'border-hairline bg-surface text-gray-900 hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-tile-hover'
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    active ? 'bg-white/20 text-white' : 'bg-brand-600/10 text-brand-600 group-hover:bg-brand-600/15'
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight">{tab.label}</span>
                  <span className={`block text-xs ${active ? 'text-white/70' : 'text-gray-500'}`}>{tab.hint}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-2xl font-bold leading-none tabular-nums">{tab.count}</span>
                  <span className={`block text-[11px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{tab.unit}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-6">
          {activeTab === 'performance' && (
            <div className="space-y-2">
              {performanceHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No quiz attempts yet</p>
              ) : (
                performanceHistory.map((record) => {
                  const duration = formatDuration(record.time_taken_seconds);
                  const answered =
                    record.total_questions !== null && record.total_questions > 0
                      ? record.total_questions
                      : null;
                  return (
                    <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
                        <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{record.quiz_title}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(record.submitted_at)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          {answered !== null && (
                            <span className="flex items-center gap-1">
                              <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                              {record.correct_answers} / {answered} correct
                            </span>
                          )}
                          {duration && (
                            <span className="flex items-center gap-1">
                              <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                              {duration}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xl font-bold leading-none ${
                            record.score !== null ? getScoreColor(record.score) : 'text-gray-400'
                          }`}
                        >
                          {record.score !== null ? `${record.score}%` : '—'}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {record.score !== null ? scoreDescriptor(record.score) : 'Not scored'}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-2">
              {scenarioHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No scenario performance records yet</p>
              ) : (
                scenarioHistory.map((record) => {
                  const duration = formatDuration(record.time_taken);
                  // A scenario with no authored checklist, and a run whose
                  // progress couldn't be read, are different things — neither
                  // should read as "0 / 8".
                  const total = record.total_tasks;
                  const done = record.completed_tasks;
                  const hasProgress = total !== null && done !== null && total > 0;
                  return (
                    <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        <FontAwesomeIcon icon={faStethoscope} className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{record.scenario_title}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(record.completed_at)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <FontAwesomeIcon icon={faListCheck} className="h-3 w-3" />
                            {hasProgress
                              ? `${done} / ${total} tasks performed`
                              : total === 0
                                ? 'No checklist tasks'
                                : 'Task progress unavailable'}
                          </span>
                          {duration && (
                            <span className="flex items-center gap-1">
                              <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                              {duration}
                            </span>
                          )}
                        </div>
                        {hasProgress && (
                          <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-purple-500 transition-all"
                              style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-xl font-bold leading-none ${getScoreColor(record.score)}`}>
                          {record.score}%
                        </p>
                        <p className="mt-1 text-[11px] text-gray-400">{scoreDescriptor(record.score)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'competencies' && (
            <div className="space-y-6">
              {competencies.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No competency data yet. Scores appear automatically once this student submits an
                  assessment whose criteria are mapped to competency areas — or record one by hand
                  below.
                </p>
              ) : (
                <>
                  {needsImprovement.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <p className="text-sm font-semibold text-rose-800">
                        Needs improvement ({needsImprovement.length})
                      </p>
                      <p className="mt-1 text-sm text-rose-700">
                        {needsImprovement.map((c) => c.name).join(" · ")}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {competencies.map((c) => (
                      <div key={c.competency_id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-medium text-gray-900">{c.name}</span>
                          <span className={`font-bold shrink-0 ${getScoreColor(c.score)}`}>
                            {Math.round(c.score)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${COMPETENCY_LEVEL_BAR[c.level]}`}
                            style={{ width: `${Math.min(100, Math.max(0, c.score))}%` }}
                          />
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COMPETENCY_LEVEL_TONE[c.level]}`}
                          >
                            {COMPETENCY_LEVEL_LABEL[c.level]}
                          </span>
                          {/* Where the number came from — faculty judgement or
                              the student's own quiz performance. */}
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                            <FontAwesomeIcon
                              icon={
                                c.source === "faculty_validation" ? faCircleCheck : faClipboardCheck
                              }
                              className="w-3 h-3"
                            />
                            {c.source === "faculty_validation"
                              ? "Faculty validated"
                              : `From assessments${c.attempts > 0 ? ` (${c.attempts})` : ""}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {scoreHistory.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Validation history</h3>
                  <div className="space-y-2">
                    {scoreHistory.slice(0, 10).map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {record.competency_areas?.name ?? "Unknown competency"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(record.created_at).toLocaleString()}
                            {record.remarks ? ` · ${record.remarks}` : ""}
                          </p>
                        </div>
                        <span className={`font-bold ${getScoreColor(record.score)}`}>
                          {record.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {summaryOpen && (
        <StudentSummaryModal
          studentName={student.name}
          summary={aiSummary}
          generatedAt={summaryGeneratedAt}
          loading={summaryLoading}
          error={summaryError}
          stale={summaryStale}
          onRetry={() => requestSummary({ force: true })}
          onClose={closeSummary}
        />
      )}
    </div>
  );
}