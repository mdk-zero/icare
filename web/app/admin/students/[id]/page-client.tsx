"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBolt,
  faChartLine,
  faClipboardList,
  faClock,
  faShieldHalved,
  faTriangleExclamation,
  faStethoscope,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchLatestPrediction,
  fetchStudentScenarioHistory,
  fetchCompetencyAreas,
  fetchCompetencyScores,
  type ScenarioPerformance,
  apiFetch,
} from "../../../lib/api";
import Avatar from "../../../components/Avatar";
import Card from "../../../components/Card";
import StatTile from "../../../components/StatTile";
import PageHeader from "../../../components/PageHeader";
import { usePageData } from "../../../lib/use-page-data";
import { EcgLoader } from "../../../components/EcgLoader";

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
  picture_url: string | null;
  sex: "male" | "female" | null;
  created_at: string;
  last_login_at: string | null;
  quizzes_completed: number;
  average_score: number | null;
}

// Stable empty fallbacks, so nothing downstream sees a new value each render.
const NO_ATTEMPTS: AttemptRow[] = [];
const NO_SCENARIO_HISTORY: ScenarioPerformance[] = [];
const NO_COMPETENCIES: Record<string, number> = {};

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

  const [activeTab, setActiveTab] = useState("performance");

  // Keyed by student, so stepping back to the roster and into the same student
  // again — the common way to compare two of them — costs no reload.
  const { data, loading } = usePageData(
    studentId ? `admin:student:${studentId}` : null,
    async () => {
      const [detailRes, prediction, scenarioHistory, areas, scores] = await Promise.all([
        apiFetch(`/api/admin/students/${studentId}`, { credentials: "include" }),
        fetchLatestPrediction(studentId),
        fetchStudentScenarioHistory(studentId),
        fetchCompetencyAreas(),
        fetchCompetencyScores(studentId),
      ]);

      const detail = detailRes.ok
        ? ((await detailRes.json()) as { student?: StudentData; attempts?: AttemptRow[] })
        : {};

      // Latest validated score per competency area (scores arrive newest-first).
      const areaNames = new Map(areas.map((a) => [a.id, a.name]));
      const competencies: Record<string, number> = {};
      for (const score of scores) {
        const name = score.competency_areas?.name ?? areaNames.get(score.competency_id);
        if (name && competencies[name] === undefined) competencies[name] = Math.round(score.score);
      }

      return {
        student: detail.student ?? null,
        attempts: detail.attempts ?? NO_ATTEMPTS,
        prediction,
        scenarioHistory,
        competencies,
      };
    },
  );

  const student = data?.student ?? null;
  const attempts = data?.attempts ?? NO_ATTEMPTS;
  const scenarioHistory = data?.scenarioHistory ?? NO_SCENARIO_HISTORY;
  const competencies = data?.competencies ?? NO_COMPETENCIES;
  const prediction = data?.prediction ?? null;

  const riskLevel: "low" | "high" | null = prediction
    ? prediction.risk === "at_risk"
      ? "high"
      : "low"
    : null;


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
          <EcgLoader size="xl" className="text-brand-600" />
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
          className="mt-4 px-4 py-2 text-brand-600 font-medium"
        >
          Back to Students
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faListCheck} className="w-3.5 h-3.5" />,
          label: "Student Management",
        }}
        title={student.name}
        subtitle={student.email}
      />

      <div className="mb-4">
        <button
          onClick={() => router.push("/admin/student-management")}
          className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
          Back to students
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Card padding="sm" className="flex h-full flex-col">
            <div className="flex items-center gap-4 mb-6">
              <Avatar
                name={student.name}
                src={student.picture_url}
                userId={student.id}
                sex={student.sex}
                size="xl"
                tone="solid"
              />
              <div>
                <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
                <p className="text-gray-500">{student.email}</p>
                <p className="text-sm text-gray-400">
                  Enrolled {new Date(student.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                icon={faChartLine}
                value={student.average_score !== null ? `${student.average_score}%` : "—"}
                label="Avg Score"
              />
              <StatTile icon={faClipboardList} value={student.quizzes_completed} label="Skill Assessments" />
              <StatTile icon={faClock} value={formatLastActive(student.last_login_at)} label="Last Active" />
              <StatTile
                icon={riskLevel === "high" ? faTriangleExclamation : faShieldHalved}
                value={riskLevel ? (riskLevel === "high" ? "At Risk" : "On Track") : "Not Scored"}
                valueColor={
                  riskLevel === "high" ? "text-red-600" : riskLevel === "low" ? "text-emerald-600" : "text-gray-500"
                }
                iconBg={riskLevel === "high" ? "bg-red-100" : riskLevel === "low" ? "bg-emerald-100" : "bg-gray-100"}
                iconColor={riskLevel === "high" ? "text-red-600" : riskLevel === "low" ? "text-emerald-600" : "text-gray-500"}
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
                <div className="border-t border-hairline pt-3">
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
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          { key: "performance", label: "Performance", hint: "Skill Assessment results", count: attempts.length, unit: "quizzes", icon: faChartLine },
          { key: "scenarios", label: "Scenarios", hint: "Simulation runs", count: scenarioHistory.length, unit: "runs", icon: faStethoscope },
          { key: "competencies", label: "Skill Areas", hint: "Skill mastery", count: Object.keys(competencies).length, unit: "areas", icon: faListCheck },
        ] as const).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={active}
              className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-[#1b6b7b] bg-gradient-to-br from-[#1b6b7b] to-[#124a52] text-white shadow-[0_8px_20px_-6px_rgba(27,107,123,0.5)]"
                  : "border-hairline bg-surface text-gray-900 hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-tile-hover"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  active ? "bg-white/20 text-white" : "bg-brand-600/10 text-brand-600 group-hover:bg-brand-600/15"
                }`}
              >
                <FontAwesomeIcon icon={tab.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-tight">{tab.label}</span>
                <span className={`block text-xs ${active ? "text-white/70" : "text-gray-500"}`}>{tab.hint}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-2xl font-bold leading-none tabular-nums">{tab.count}</span>
                <span className={`block text-[11px] ${active ? "text-white/70" : "text-gray-400"}`}>{tab.unit}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-6">
          {activeTab === "performance" && (
            <div className="space-y-4">
              {attempts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No submitted skill assessment attempts yet</p>
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
                        {record.total_tasks !== null && record.completed_tasks !== null
                          ? record.total_tasks > 0
                            ? `${record.completed_tasks} / ${record.total_tasks} tasks performed`
                            : "No checklist tasks"
                          : "Task progress unavailable"}
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
                  No validated skill area scores yet — faculty record them from the student&apos;s Skill Areas tab.
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
