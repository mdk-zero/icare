"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  fetchFacultyStudentDetail,
  fetchLatestPrediction,
  RiskPrediction,
  logAuditAction,
  getCurrentFacultyUser,
  FacultyStudent,
  fetchStudentScenarioHistory,
  fetchCompetencyAreas,
  fetchCompetencyScores,
  recordCompetencyScore,
  generateStudentSummary,
  CompetencyArea,
  CompetencyScore,
  StudentAISummary,
} from "../../../lib/api";
import { SkeletonProfileHeader, SkeletonRiskPredictionCard, SkeletonTabContent } from "../../../components/skeletons";
import Card from "../../../components/Card";

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

export default function StudentDetailClient() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.id as string;
  
  const [student, setStudent] = useState<FacultyStudent | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistory[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioPerformanceRecord[]>([]);
  const [competencies, setCompetencies] = useState<Record<string, number>>({});
  const [competencyAreas, setCompetencyAreas] = useState<CompetencyArea[]>([]);
  const [scoreHistory, setScoreHistory] = useState<CompetencyScore[]>([]);
  const [validateForm, setValidateForm] = useState({ competency_id: "", score: "", remarks: "" });
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [riskPrediction, setRiskPrediction] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(true);
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
    if (studentId) {
      loadStudentData();
    }
  }, [studentId]);

  useEffect(() => {
    if (!studentId || summaryRequestedRef.current) return;
    summaryRequestedRef.current = true;
    handleGenerateSummary();
  }, [studentId]);

  const loadCompetencyData = async () => {
    const [areas, scores] = await Promise.all([
      fetchCompetencyAreas(),
      fetchCompetencyScores(studentId),
    ]);
    setCompetencyAreas(areas);
    setScoreHistory(scores);
    // Scores come newest-first; keep the latest per competency for the bars.
    const latest: Record<string, number> = {};
    for (const record of scores) {
      const name = record.competency_areas?.name ?? record.competency_id;
      if (!(name in latest)) latest[name] = record.score;
    }
    setCompetencies(latest);
  };

  const loadStudentData = async () => {
    setLoading(true);
    const [data, prediction] = await Promise.all([
      fetchFacultyStudentDetail(studentId),
      fetchLatestPrediction(studentId),
    ]);
    setRiskPrediction(prediction);
    if (data) {
      setStudent(data.student);
      setPerformanceHistory(data.performance_history);
    }

    const scenarios = await fetchStudentScenarioHistory(studentId);
    setScenarioHistory(scenarios);
    await loadCompetencyData();

    setLoading(false);
  };

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

  const handleValidate = async () => {
    setValidateError(null);
    const scoreValue = Number(validateForm.score);
    if (!validateForm.competency_id) {
      setValidateError("Select a competency area.");
      return;
    }
    if (validateForm.score.trim() === "" || Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      setValidateError("Score must be a number between 0 and 100.");
      return;
    }
    setValidating(true);
    const result = await recordCompetencyScore({
      student_id: studentId,
      competency_id: validateForm.competency_id,
      score: scoreValue,
      remarks: validateForm.remarks.trim() || null,
    });
    setValidating(false);
    if (result.error) {
      setValidateError(result.error);
      return;
    }
    setValidateForm({ competency_id: "", score: "", remarks: "" });
    await loadCompetencyData();
  };

  const riskChipClass = riskPrediction
    ? riskPrediction.risk === 'at_risk'
      ? 'bg-red-100 text-red-700 border-red-200'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-gray-100 text-gray-700 border-gray-200';

  const featureLabel = (feature: string) =>
    feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getCompetencyColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

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
      <div className="mb-4">
        <button 
          onClick={() => router.push('/faculty/students')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Card padding="sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-brand-600 to-brand-700 rounded-full flex items-center justify-center text-white font-bold text-xl">
                {student.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                <p className="text-gray-500">{student.email}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-400">{student.program} - Year {student.year}</p>
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
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.average_score}%</p>
                <p className="text-sm text-gray-500">Avg Score</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.quiz_count}</p>
                <p className="text-sm text-gray-500">Quizzes</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.last_activity}</p>
                <p className="text-sm text-gray-500">Last Active</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${riskChipClass}`}>
                  {riskPrediction
                    ? riskPrediction.risk === 'at_risk' ? 'At Risk' : 'Safe'
                    : 'Not Scored'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <Card padding="sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
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
                      className={`h-full rounded-full ${riskPrediction.risk === 'at_risk' ? 'bg-red-500' : 'bg-emerald-500'}`}
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
                          <div className={`w-2 h-2 rounded-full ${exp.direction === 'increases_risk' ? 'bg-red-500' : 'bg-emerald-500'}`} />
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
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
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
                  { title: "Strengths", items: aiSummary.strengths, dot: "bg-emerald-500" },
                  { title: "Areas for Improvement", items: aiSummary.areas_for_improvement, dot: "bg-amber-500" },
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

        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="border-b border-hairline">
            <div className="flex gap-4 px-4">
            {['performance', 'scenarios', 'competencies'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'performance' && (
            <div className="space-y-2">
              {performanceHistory.map((record, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{record.quiz_title}</p>
                    <p className="text-sm text-gray-500">{record.date} • {record.time_taken} min</p>
                  </div>
                  <div className={`text-xl font-bold ${getScoreColor(record.score)}`}>
                    {record.score}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-2">
              {scenarioHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No scenario performance records yet</p>
              ) : (
                scenarioHistory.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{record.scenario_title}</p>
                      <p className="text-sm text-gray-500">{record.completed_at} • {Math.floor(record.time_taken / 60)}m {record.time_taken % 60}s</p>
                      <p className="text-xs text-gray-400 mt-1">{record.completed_tasks?.length || 0} / {record.total_tasks || 0} tasks completed</p>
                    </div>
                    <div className={`text-xl font-bold ${getScoreColor(record.score)}`}>
                      {record.score}%
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'competencies' && (
            <div className="space-y-6">
              {Object.keys(competencies).length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No validated competency scores yet. Record the first one below.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(competencies).map(([key, value]) => (
                    <div key={key} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="font-medium text-gray-900">{key}</span>
                        <span className={`font-bold ${getScoreColor(value)}`}>{value}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getCompetencyColor(value)}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-5 bg-brand-600/5 border border-brand-600/20 rounded-xl">
                <h3 className="font-semibold text-gray-900 mb-3">Validate competency</h3>
                {validateError && (
                  <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                    {validateError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={validateForm.competency_id}
                    onChange={(e) =>
                      setValidateForm((f) => ({ ...f, competency_id: e.target.value }))
                    }
                    className="px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                  >
                    <option value="">Select competency…</option>
                    {competencyAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Score (0–100)"
                    value={validateForm.score}
                    onChange={(e) => setValidateForm((f) => ({ ...f, score: e.target.value }))}
                    className="px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                  />
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition-all disabled:opacity-50 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                  >
                    {validating ? "Saving…" : "Record Score"}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Remarks (optional)"
                  value={validateForm.remarks}
                  onChange={(e) => setValidateForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="mt-3 w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                />
              </div>

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