"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScenarioAssignment,
  FacultyScenarioTask,
  fetchScenarioAssignments,
  fetchFacultyAssignmentTasks,
  setFacultyTaskChecked,
  finalizeScenarioAssignment,
} from "../../../lib/api";

type Filter = "awaiting" | "in_progress" | "completed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "awaiting", label: "Awaiting review" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Finalized" },
  { key: "all", label: "All" },
];

function categoryColor(category: string) {
  switch (category) {
    case "assessment":
      return "bg-blue-100 text-blue-700";
    case "intervention":
      return "bg-purple-100 text-purple-700";
    case "medication":
      return "bg-red-100 text-red-700";
    case "communication":
      return "bg-green-100 text-green-700";
    case "documentation":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function isAwaiting(a: ScenarioAssignment) {
  return Boolean(a.submitted_at) && a.status !== "completed";
}

export default function FacultyScenarioReviewClient() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<ScenarioAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("awaiting");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<FacultyScenarioTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    const data = await fetchScenarioAssignments();
    setAssignments(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const loadTasks = useCallback(async (assignmentId: string) => {
    setTasksLoading(true);
    const result = await fetchFacultyAssignmentTasks(assignmentId);
    setTasks(result?.tasks ?? []);
    setTasksLoading(false);
  }, []);

  const selectAssignment = (id: string) => {
    setSelectedId(id);
    void loadTasks(id);
  };

  const selected = assignments.find((a) => a.id === selectedId) ?? null;
  const finalized = selected?.status === "completed";

  const visible = useMemo(() => {
    return assignments.filter((a) => {
      if (filter === "awaiting") return isAwaiting(a);
      if (filter === "in_progress") return a.status !== "completed" && !a.submitted_at;
      if (filter === "completed") return a.status === "completed";
      return true;
    });
  }, [assignments, filter]);

  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const earnedPoints = tasks.filter((t) => t.is_completed).reduce((sum, t) => sum + t.points, 0);
  const projectedScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  const handleToggle = async (task: FacultyScenarioTask) => {
    if (finalized || task.verification !== "faculty" || !selectedId) return;
    const next = !task.is_completed;
    setBusyTaskId(task.id);
    // Optimistic update.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, is_completed: next, completed_via: next ? "faculty" : null } : t,
      ),
    );
    const ok = await setFacultyTaskChecked(selectedId, task.id, next);
    if (!ok) {
      await loadTasks(selectedId); // revert to server truth
    }
    setBusyTaskId(null);
  };

  const handleFinalize = async () => {
    if (!selectedId || finalized) return;
    setFinalizing(true);
    const result = await finalizeScenarioAssignment(selectedId);
    if (result) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === selectedId
            ? {
                ...a,
                status: "completed",
                score: result.score,
                completed_at: new Date().toISOString(),
              }
            : a,
        ),
      );
      await loadTasks(selectedId);
    }
    setFinalizing(false);
  };

  const awaitingCount = assignments.filter(isAwaiting).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-surface border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/faculty/scenarios")}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Back to scenarios"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Review Submissions</h1>
            <p className="text-sm text-gray-500">
              Verify hands-on tasks and finalize scenario scores
              {awaitingCount > 0 ? ` · ${awaitingCount} awaiting review` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignment list */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === f.key
                    ? "bg-brand-600 text-white"
                    : "bg-surface text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {loading && <p className="text-sm text-gray-500 px-1">Loading…</p>}
            {!loading && visible.length === 0 && (
              <p className="text-sm text-gray-500 px-1">Nothing here right now.</p>
            )}
            {visible.map((a) => (
              <button
                key={a.id}
                onClick={() => selectAssignment(a.id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedId === a.id
                    ? "border-brand-600 bg-brand-600/5"
                    : "border-gray-200 bg-surface hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 truncate">{a.student_name}</p>
                  {a.status === "completed" ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 shrink-0">
                      {a.score ?? 0}%
                    </span>
                  ) : isAwaiting(a) ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 shrink-0">
                      Awaiting review
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 shrink-0">
                      {a.status.replace("_", " ")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate mt-0.5">{a.scenario_title}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Task detail */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-surface rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
              Select a submission to review its tasks.
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">{selected.student_name}</h2>
                  <p className="text-sm text-gray-500">{selected.scenario_title}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-brand-600">
                    {finalized ? (selected.score ?? 0) : projectedScore}%
                  </p>
                  <p className="text-xs text-gray-500">{finalized ? "Final score" : "Projected"}</p>
                </div>
              </div>

              <div className="p-6 space-y-3">
                {tasksLoading && <p className="text-sm text-gray-500">Loading tasks…</p>}
                {!tasksLoading && tasks.length === 0 && (
                  <p className="text-sm text-gray-500">This scenario has no tasks.</p>
                )}
                {tasks.map((task) => {
                  const isFaculty = task.verification === "faculty";
                  const interactive = isFaculty && !finalized;
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        task.is_completed ? "border-green-500 bg-green-50" : "border-gray-200"
                      } ${interactive ? "cursor-pointer hover:border-gray-300" : ""}`}
                      onClick={() => interactive && handleToggle(task)}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            task.is_completed
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-gray-300"
                          } ${busyTaskId === task.id ? "opacity-50" : ""}`}
                        >
                          {task.is_completed && (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p
                              className={`font-medium ${task.is_completed ? "text-green-800" : "text-gray-800"}`}
                            >
                              {task.title}
                            </p>
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${categoryColor(task.category)}`}
                            >
                              {task.category}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                isFaculty
                                  ? "bg-violet-100 text-violet-700"
                                  : "bg-sky-100 text-sky-700"
                              }`}
                            >
                              {isFaculty ? "Faculty-verified" : "Auto"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">{task.description}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {task.points} points
                            {task.is_completed
                              ? task.completed_via === "system"
                                ? " · auto-completed"
                                : " · verified by faculty"
                              : isFaculty
                                ? " · check when performed"
                                : " · completes from the student's charting"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-6 border-t border-gray-100 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  {finalized
                    ? "This assignment is finalized."
                    : selected.submitted_at
                      ? "Student has submitted. Verify the hands-on tasks, then finalize."
                      : "Student has not submitted yet — you can still finalize when ready."}
                </p>
                <button
                  onClick={handleFinalize}
                  disabled={finalized || finalizing || tasksLoading}
                  className="px-5 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {finalized ? "Finalized" : finalizing ? "Finalizing…" : "Finalize & lock score"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
