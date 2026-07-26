"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faCheck } from "@fortawesome/free-solid-svg-icons";
import {
  SimulationScenario,
  ScenarioAssignment,
  FacultyScenarioTask,
  StudentScenarioTasksResult,
  fetchScenarioById,
  fetchStudentScenarioAssignments,
  fetchStudentScenarioTasks,
  submitScenarioForReview,
} from "../../lib/api";

function categoryColor(category: string) {
  switch (category) {
    case "assessment": return "bg-blue-100 text-blue-700";
    case "intervention": return "bg-purple-100 text-purple-700";
    case "medication": return "bg-red-100 text-red-700";
    case "communication": return "bg-green-100 text-green-700";
    case "documentation": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function ScenarioRunnerClient() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [assignment, setAssignment] = useState<ScenarioAssignment | null>(null);
  const [taskInfo, setTaskInfo] = useState<StudentScenarioTasksResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<"patient" | "tasks" | "objectives">("tasks");

  const reloadTasks = useCallback(async (assignmentId: string) => {
    const result = await fetchStudentScenarioTasks(assignmentId);
    if (result) setTaskInfo(result);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [scenarioData, assignments] = await Promise.all([
        fetchScenarioById(scenarioId),
        fetchStudentScenarioAssignments(""),
      ]);
      if (!scenarioData) {
        setError("Scenario not found or you do not have access.");
        setLoading(false);
        return;
      }
      const matching = assignments.find((a) => a.scenario_id === scenarioId);
      if (!matching) {
        setError("You have not been assigned this scenario.");
        setLoading(false);
        return;
      }
      setScenario(scenarioData);
      setAssignment(matching);
      await reloadTasks(matching.id);
      setLoading(false);
    }
    void load();
  }, [scenarioId, reloadTasks]);

  const tasks: FacultyScenarioTask[] = useMemo(() => taskInfo?.tasks ?? [], [taskInfo]);
  const status = taskInfo?.assignment.status ?? assignment?.status ?? "pending";
  const submittedAt = taskInfo?.assignment.submitted_at ?? null;
  const isCompleted = status === "completed";
  const isSubmitted = !isCompleted && Boolean(submittedAt);
  const isActive = !isCompleted && !isSubmitted;

  // Auto-completions happen while the student charts on another page; refresh on
  // return so the checked-off tasks show up.
  useEffect(() => {
    if (!assignment) return;
    const onFocus = () => reloadTasks(assignment.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [assignment, reloadTasks]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const earnedPoints = tasks.filter((t) => t.is_completed).reduce((sum, t) => sum + t.points, 0);
  const progress = tasks.length ? (completedCount / tasks.length) * 100 : 0;
  const autoPending = tasks.filter((t) => t.verification === "system" && !t.is_completed).length;

  const handleSubmit = async () => {
    if (!assignment || submitting) return;
    setSubmitting(true);
    const updated = await submitScenarioForReview(assignment.id, elapsedTime);
    if (updated) {
      await reloadTasks(assignment.id);
    } else {
      alert("Unable to submit for review. Please try again.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading scenario...</p>
        </div>
      </div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-red-600 mb-4">{error || "Unable to load scenario."}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const patientCase = (scenario.patient_case || {}) as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-surface border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Back to dashboard"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{scenario.title}</h1>
              <p className="text-sm text-gray-500">{scenario.category}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500">{isActive ? "Elapsed Time" : "Time"}</p>
              <p className="text-xl font-mono font-bold text-gray-900">
                {formatTime(isActive ? elapsedTime : taskInfo?.assignment.time_taken ?? elapsedTime)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">{isCompleted ? "Score" : "Progress"}</p>
              <p className="text-xl font-bold text-brand-600">
                {isCompleted ? `${taskInfo?.assignment.score ?? 0}%` : `${Math.round(progress)}%`}
              </p>
            </div>
            <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100">
                <div className="flex">
                  {[
                    { key: "tasks", label: "Tasks" },
                    { key: "patient", label: "Patient Case" },
                    { key: "objectives", label: "Learning Objectives" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveSection(tab.key as "patient" | "tasks" | "objectives")}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        activeSection === tab.key
                          ? "bg-brand-600/5 text-brand-600 border-b-2 border-brand-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {activeSection === "tasks" && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Automatic tasks check off as you record vitals or chart in the patient record.
                      Hands-on tasks are verified by your instructor.
                    </p>
                    {tasks.length === 0 && (
                      <p className="text-sm text-gray-500">No tasks have been set for this scenario yet.</p>
                    )}
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-4 rounded-xl border-2 ${
                          task.is_completed ? "border-green-500 bg-green-50" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              task.is_completed ? "border-green-500 bg-green-500 text-white" : "border-gray-300"
                            }`}
                          >
                            {task.is_completed && (
                              <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className={`font-medium ${task.is_completed ? "text-green-800" : "text-gray-800"}`}>
                                {task.title}
                              </p>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${categoryColor(task.category)}`}>
                                {task.category}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  task.verification === "faculty" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
                                }`}
                              >
                                {task.verification === "faculty" ? "Faculty" : "Auto"}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{task.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {task.points} points
                              {task.is_completed
                                ? task.completed_via === "system"
                                  ? " · auto-completed"
                                  : " · verified by faculty"
                                : task.verification === "system"
                                  ? task.system_trigger === "vitals"
                                    ? " · record vitals to complete"
                                    : " · chart to complete"
                                  : " · verified by your instructor"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === "patient" && (
                  <div className="space-y-6">
                    {typeof patientCase.chief_complaint === "string" && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="font-semibold text-red-800">Chief Complaint</p>
                        <p className="text-red-700">{patientCase.chief_complaint}</p>
                      </div>
                    )}
                    {patientCase.vitals != null && typeof patientCase.vitals === "object" && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Vital Signs</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {Object.entries(patientCase.vitals as Record<string, unknown>).map(([key, value]) => (
                            <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 capitalize">{key.replace(/_/g, " ")}</p>
                              <p className="font-semibold text-gray-800">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {typeof patientCase.medical_history === "string" && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Medical History</h3>
                        <p className="text-gray-600">{patientCase.medical_history}</p>
                      </div>
                    )}
                    {typeof patientCase.diagnosis === "string" && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Diagnosis</h3>
                        <p className="text-gray-800 font-medium">{patientCase.diagnosis}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "objectives" && (
                  <ul className="space-y-3">
                    {scenario.learning_objectives?.map((objective, index) => (
                      <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-brand-600/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-medium text-brand-600">{index + 1}</span>
                        </div>
                        <p className="text-gray-700">{objective}</p>
                      </li>
                    ))}
                    {(!scenario.learning_objectives || scenario.learning_objectives.length === 0) && (
                      <p className="text-sm text-gray-500">No learning objectives listed.</p>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">
                {isCompleted ? "Finalized" : isSubmitted ? "Submitted" : "Your Progress"}
              </h3>

              <div className="grid grid-cols-2 gap-3 text-center mb-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold text-gray-900">{completedCount}/{tasks.length}</p>
                  <p className="text-xs text-gray-500">Tasks done</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold text-brand-600">
                    {isCompleted ? `${taskInfo?.assignment.score ?? 0}%` : `${earnedPoints}/${totalPoints}`}
                  </p>
                  <p className="text-xs text-gray-500">{isCompleted ? "Final score" : "Points"}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                {isCompleted ? (
                  <div className="text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <FontAwesomeIcon icon={faCheck} className="w-7 h-7 text-green-600" />
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Your instructor finalized this scenario.</p>
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                ) : isSubmitted ? (
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-4">
                      Submitted for review. Your instructor verifies the hands-on tasks and finalizes your score.
                    </p>
                    <button
                      onClick={() => assignment && reloadTasks(assignment.id)}
                      className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                    >
                      Refresh status
                    </button>
                  </div>
                ) : (
                  <>
                    {autoPending > 0 && (
                      <p className="text-xs text-amber-600 mb-3">
                        {autoPending} automatic task{autoPending === 1 ? "" : "s"} still pending — record vitals / chart to complete.
                      </p>
                    )}
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting…" : "Submit for Review"}
                    </button>
                    <button
                      onClick={() => assignment && reloadTasks(assignment.id)}
                      className="w-full mt-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                    >
                      Refresh tasks
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
