"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
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
  StudentAISummary,
} from "../../../lib/api";
import { SkeletonProfileHeader, SkeletonRiskPredictionCard, SkeletonTabContent } from "../../../components/skeletons";
import Card from "../../../components/Card";
import Avatar from "../../../components/Avatar";
import { usePageData } from "../../../lib/use-page-data";
import LiveClock from "../../../components/LiveClock";

interface PerformanceHistory {
  quiz_title: string;
  score: number;
  date: string;
  time_taken: number;
}

interface ScenarioPerformanceRecord {
  id: string;
  scenario_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  time_taken: number;
  total_tasks: number;
  completed_tasks: string[];
}

// Stable empty fallbacks, so nothing downstream sees a new array each render.
const NO_PERFORMANCE_HISTORY: PerformanceHistory[] = [];
const NO_SCENARIO_HISTORY: ScenarioPerformanceRecord[] = [];
const NO_COMPETENCIES: ResolvedCompetency[] = [];
const NO_SCORE_HISTORY: CompetencyScore[] = [];

/** One header stat tile — icon, big value, label — sized to match its
 * siblings in the grid rather than hugging its own content. */
function StatTile({
  icon,
  iconBg,
  iconColor,
  value,
  valueColor = "text-gray-900",
  label,
}: {
  icon: IconDefinition;
  iconBg: string;
  iconColor: string;
  value: string;
  valueColor?: string;
  label: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 rounded-xl bg-gray-50 p-5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
        <FontAwesomeIcon icon={icon} className="h-5 w-5" />
      </span>
      <div>
        <p className={`text-2xl font-bold leading-tight ${valueColor}`}>{value}</p>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function StudentDetailClient() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.id as string;
  
  const [activeTab, setActiveTab] = useState("performance");
  const [aiSummary, setAiSummary] = useState<StudentAISummary | null>(null);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const loggedRef = useRef(false);
  const summaryRequestedRef = useRef(false);

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

  useEffect(() => {
    if (!studentId || summaryRequestedRef.current) return;
    summaryRequestedRef.current = true;
    handleGenerateSummary();
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

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    const result = await generateStudentSummary(studentId);
    setSummaryLoading(false);
    if (result.error || !result.summary) {
      setSummaryError(result.error ?? "Unable to generate summary");
      return;
    }
    setAiSummary(result.summary);
    setSummaryGeneratedAt(result.generated_at ?? new Date().toISOString());

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
  };

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
            <div className="flex items-center gap-4 mb-6">
              <Avatar name={student.name} src={student.picture_url} size="xl" tone="solid" />
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
            
            <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                icon={faChartLine}
                iconBg="bg-brand-600/10"
                iconColor="text-brand-600"
                value={student.average_score != null ? `${student.average_score}%` : "—"}
                label="Avg Score"
              />
              <StatTile
                icon={faClipboardList}
                iconBg="bg-indigo-100"
                iconColor="text-indigo-600"
                value={String(student.quiz_count ?? 0)}
                label="Quizzes"
              />
              <StatTile
                icon={faClock}
                iconBg="bg-amber-100"
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
                      ? "bg-red-100"
                      : "bg-emerald-100"
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

      <div className="mb-4">
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-brand-600/10 rounded-lg">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">AI Performance Summary</h3>
                <p className="text-xs text-gray-400">
                  Generated from quizzes, scenarios, competencies, and the ML risk prediction
                </p>
              </div>
            </div>
            {!summaryLoading && (
              <button
                onClick={handleGenerateSummary}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition-all shadow-[0_2px_6px_rgba(27,107,123,0.2)] shrink-0"
              >
                {summaryError ? "Retry" : "Regenerate"}
              </button>
            )}
          </div>

          {summaryError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {summaryError}
            </div>
          )}

          {summaryLoading && (
            <div className="mt-3 space-y-2 animate-pulse">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 rounded" />
            </div>
          )}

          {!summaryLoading && aiSummary && (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">{aiSummary.overview}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { title: "Strengths", items: aiSummary.strengths, dot: "bg-emerald-600" },
                  { title: "Areas for Improvement", items: aiSummary.areas_for_improvement, dot: "bg-amber-600" },
                  { title: "Recommendations", items: aiSummary.recommendations, dot: "bg-brand-600" },
                ].map((section) => (
                  <div key={section.title} className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm font-semibold text-gray-900 mb-2">{section.title}</p>
                    {section.items.length === 0 ? (
                      <p className="text-sm text-gray-400">Nothing noted.</p>
                    ) : (
                      <ul className="space-y-2">
                        {section.items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${section.dot}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {summaryGeneratedAt && (
                <p className="text-xs text-gray-400 border-t border-hairline pt-3">
                  AI-generated {new Date(summaryGeneratedAt).toLocaleString()} — review before
                  acting on it.
                </p>
              )}
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
                performanceHistory.map((record, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
                      <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{record.quiz_title}</p>
                      <p className="text-sm text-gray-500">{record.date} • {record.time_taken} min</p>
                    </div>
                    <div className={`text-xl font-bold shrink-0 ${getScoreColor(record.score)}`}>
                      {record.score}%
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-2">
              {scenarioHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No scenario performance records yet</p>
              ) : (
                scenarioHistory.map((record) => (
                  <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                      <FontAwesomeIcon icon={faStethoscope} className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{record.scenario_title}</p>
                      <p className="text-sm text-gray-500">{record.completed_at} • {Math.floor(record.time_taken / 60)}m {record.time_taken % 60}s</p>
                      <p className="text-xs text-gray-400 mt-1">{record.completed_tasks?.length || 0} / {record.total_tasks || 0} tasks completed</p>
                    </div>
                    <div className={`text-xl font-bold shrink-0 ${getScoreColor(record.score)}`}>
                      {record.score}%
                    </div>
                  </div>
                ))
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
    </div>
  );
}