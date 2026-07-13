"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  fetchLatestPrediction,
  fetchStudentScenarioHistory,
  fetchCompetencyAreas,
  fetchCompetencyScores,
  type RiskPrediction,
  type ScenarioPerformance,
} from "../../../lib/api";

interface AttemptRow {
  id: string;
  quiz_title: string;
  score: number | null;
  submitted_at: string | null;
  time_taken_seconds: number | null;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
  quizzes_completed: number;
  average_score: number | null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLastActive(value: string | null): string {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function StudentDetailClient() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.id as string;

  const [student, setStudent] = useState<StudentData | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioPerformance[]>([]);
  const [competencies, setCompetencies] = useState<Record<string, number>>({});
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("performance");

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      const [detailRes, pred, scenarios, areas, scores] = await Promise.all([
        fetch(`/api/admin/students/${studentId}`, { credentials: "include" }),
        fetchLatestPrediction(studentId),
        fetchStudentScenarioHistory(studentId),
        fetchCompetencyAreas(),
        fetchCompetencyScores(studentId),
      ]);

      if (detailRes.ok) {
        const json = (await detailRes.json()) as { student: StudentData; attempts: AttemptRow[] };
        setStudent(json.student);
        setAttempts(json.attempts ?? []);
      }
      setPrediction(pred);
      setScenarioHistory(scenarios);

      // Latest validated score per competency area (scores arrive newest-first).
      const areaNames = new Map(areas.map((a) => [a.id, a.name]));
      const byCompetency: Record<string, number> = {};
      for (const score of scores) {
        const name = score.competency_areas?.name ?? areaNames.get(score.competency_id);
        if (name && byCompetency[name] === undefined) byCompetency[name] = Math.round(score.score);
      }
      setCompetencies(byCompetency);
    };
    load().finally(() => setLoading(false));
  }, [studentId]);

  const riskLevel: "low" | "high" | null = prediction
    ? prediction.risk === "at_risk"
      ? "high"
      : "low"
    : null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high":
        return "bg-red-100 text-red-700 border-red-200";
      case "low":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getCompetencyColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#1B6B7B] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Loading student data...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-gray-500">Student not found</p>
        <button
          onClick={() => router.push("/admin/student-management")}
          className="mt-4 px-4 py-2 text-[#1B6B7B] font-medium"
        >
          Back to Students
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push("/admin/student-management")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#1B6B7B] to-[#145a63] rounded-full flex items-center justify-center text-white font-bold text-xl">
                {student.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                <p className="text-gray-500">{student.email}</p>
                <p className="text-sm text-gray-400">
                  Enrolled {new Date(student.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">
                  {student.average_score !== null ? `${student.average_score}%` : "—"}
                </p>
                <p className="text-sm text-gray-500">Avg Score</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{student.quizzes_completed}</p>
                <p className="text-sm text-gray-500">Quizzes</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{formatLastActive(student.last_login_at)}</p>
                <p className="text-sm text-gray-500">Last Active</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl flex items-center justify-center">
                {riskLevel ? (
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(riskLevel)}`}>
                    {riskLevel === "high" ? "At Risk" : "On Track"}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">No prediction yet</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">ML Risk Prediction</h3>
          </div>

          {!prediction ? (
            <p className="text-sm text-gray-400">
              No prediction on record yet. Run the ML jobs from the Analytics page to score this cohort.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Risk Level</span>
                <span className={`font-medium ${prediction.risk === "at_risk" ? "text-red-600" : "text-emerald-600"}`}>
                  {prediction.risk === "at_risk" ? "AT RISK" : "SAFE"}
                </span>
              </div>
              {prediction.probability !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Risk Probability</span>
                  <span className="font-medium text-gray-900">{Math.round(prediction.probability * 100)}%</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Predicted</span>
                <span className="font-medium text-gray-900">{formatDateTime(prediction.predicted_at)}</span>
              </div>
              {prediction.ml_models && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Model</span>
                  <span className="font-medium text-gray-900 text-sm">
                    {prediction.ml_models.kind} v{prediction.ml_models.version}
                    {prediction.ml_models.is_baseline ? " (baseline)" : ""}
                  </span>
                </div>
              )}
              {prediction.explanations.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-sm text-gray-500 mb-2">Top Contributing Factors</p>
                  <div className="space-y-1">
                    {prediction.explanations.slice(0, 4).map((exp) => (
                      <div key={exp.feature} className="flex items-center gap-2 text-xs">
                        <div
                          className={`w-2 h-2 rounded-full ${exp.direction === "increases_risk" ? "bg-red-500" : "bg-emerald-500"}`}
                        />
                        <span className="text-gray-600 capitalize">{exp.feature.replaceAll("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100">
          <div className="flex gap-6 px-6">
            {["performance", "scenarios", "competencies"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-[#1B6B7B] text-[#1B6B7B]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === "performance" && (
            <div className="space-y-4">
              {attempts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No submitted quiz attempts yet</p>
              ) : (
                attempts.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">{record.quiz_title}</p>
                      <p className="text-sm text-gray-500">
                        {formatDateTime(record.submitted_at)}
                        {record.time_taken_seconds !== null &&
                          ` • ${Math.max(1, Math.round(record.time_taken_seconds / 60))} min`}
                      </p>
                    </div>
                    <div className={`text-xl font-bold ${record.score !== null ? getScoreColor(record.score) : "text-gray-400"}`}>
                      {record.score !== null ? `${record.score}%` : "—"}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "scenarios" && (
            <div className="space-y-4">
              {scenarioHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No scenario performance records yet</p>
              ) : (
                scenarioHistory.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">{record.scenario_title}</p>
                      <p className="text-sm text-gray-500">
                        {formatDateTime(record.completed_at)} • {Math.floor(record.time_taken / 60)}m {record.time_taken % 60}s
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {record.completed_tasks?.length || 0} / {record.total_tasks || 0} tasks completed
                      </p>
                    </div>
                    <div className={`text-xl font-bold ${getScoreColor(record.score)}`}>{record.score}%</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "competencies" && (
            <div>
              {Object.keys(competencies).length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No validated competency scores yet — faculty record them from the student&apos;s Competencies tab.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(competencies).map(([name, value]) => (
                    <div key={name} className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{name}</span>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
