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

function categoryChip(category: string) {
  switch (category) {
    case "assessment":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-300";
    case "intervention":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-300";
    case "medication":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-300";
    case "communication":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "documentation":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-300";
    default:
      return "bg-foreground/10 text-foreground/60";
  }
}

function isAwaiting(a: ScenarioAssignment) {
  return Boolean(a.submitted_at) && a.status !== "completed";
}

/** Circular percentage gauge in brand teal. */
function ScoreRing({ value, tone }: { value: number; tone: "brand" | "emerald" }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circ - (clamped / 100) * circ;
  return (
    <div className="relative h-[78px] w-[78px] shrink-0">
      <svg viewBox="0 0 78 78" className="h-full w-full -rotate-90">
        <circle cx="39" cy="39" r={r} fill="none" strokeWidth="6" className="stroke-hairline" />
        <circle
          cx="39"
          cy="39"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${tone === "emerald" ? "stroke-emerald-500" : "stroke-brand-600"}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold tabular-nums text-foreground">
        {clamped}%
      </span>
    </div>
  );
}

const CheckIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

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
  const doneCount = tasks.filter((t) => t.is_completed).length;

  const handleToggle = async (task: FacultyScenarioTask) => {
    if (finalized || task.verification !== "faculty" || !selectedId) return;
    const next = !task.is_completed;
    setBusyTaskId(task.id);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, is_completed: next, completed_via: next ? "faculty" : null } : t,
      ),
    );
    const ok = await setFacultyTaskChecked(selectedId, task.id, next);
    if (!ok) await loadTasks(selectedId);
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
    <div className="relative -m-3 min-h-full bg-canvas lg:-m-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand-500/[0.07] to-transparent"
      />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3.5 px-4 py-3.5 sm:px-6">
          <button
            onClick={() => router.push("/faculty/scenarios")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-foreground/55 transition-colors hover:bg-subtle hover:text-foreground"
            aria-label="Back to scenarios"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-tile">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold tracking-tight text-foreground">
              Review Submissions
            </h1>
            <p className="truncate text-sm text-foreground/55">
              Verify hands-on tasks &amp; finalize scenario scores
            </p>
          </div>
          {awaitingCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-brand-500/12 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-300">
              {awaitingCount} awaiting
            </span>
          )}
        </div>
      </header>

      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[350px_minmax(0,1fr)] lg:py-8">
        {/* Queue */}
        <div className="lg:sticky lg:top-[84px] lg:self-start">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-brand-600 text-white shadow-tile"
                      : "border border-hairline bg-surface text-foreground/60 hover:border-brand-500/40 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[70px] animate-pulse rounded-2xl border border-hairline bg-subtle"
                />
              ))}

            {!loading && visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-10 text-center">
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-subtle text-foreground/40">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground/70">All clear</p>
                <p className="mt-0.5 text-xs text-foreground/45">Nothing in this view right now.</p>
              </div>
            )}

            {!loading &&
              visible.map((a, i) => {
                const active = selectedId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => selectAssignment(a.id)}
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                    className={`w-full animate-rise rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-brand-500/60 bg-brand-500/[0.06] shadow-tile"
                        : "border-hairline bg-surface hover:border-brand-500/40 hover:shadow-tile"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{a.student_name}</p>
                      {a.status === "completed" ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                          {a.score ?? 0}%
                        </span>
                      ) : isAwaiting(a) ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-500/12 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          Awaiting
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-medium capitalize text-foreground/55">
                          {a.status.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-foreground/55">{a.scenario_title}</p>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Detail */}
        <div>
          {!selected ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.6}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="font-display text-lg font-semibold text-foreground">
                Pick a submission
              </p>
              <p className="mt-1 max-w-xs text-sm text-foreground/50">
                Choose a student from the queue to verify their hands-on tasks and lock in a score.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-hairline bg-surface shadow-tile">
              {/* Detail header */}
              <div className="flex items-center justify-between gap-4 border-b border-hairline bg-subtle/60 px-5 py-5 sm:px-6">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-bold tracking-tight text-foreground">
                    {selected.student_name}
                  </h2>
                  <p className="truncate text-sm text-foreground/55">{selected.scenario_title}</p>
                  <div className="mt-2.5 flex items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-foreground/8 px-2.5 py-1 tabular-nums text-foreground/60">
                      {doneCount}/{tasks.length} done
                    </span>
                    <span className="rounded-full bg-foreground/8 px-2.5 py-1 tabular-nums text-foreground/60">
                      {earnedPoints}/{totalPoints} pts
                    </span>
                    {finalized && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-emerald-600 dark:text-emerald-300">
                        <CheckIcon className="h-3 w-3" /> Finalized
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <ScoreRing
                    value={finalized ? (selected.score ?? 0) : projectedScore}
                    tone={finalized ? "emerald" : "brand"}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
                    {finalized ? "Final" : "Projected"}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-2.5 px-4 py-5 sm:px-6">
                {tasksLoading &&
                  [0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-[76px] animate-pulse rounded-xl border border-hairline bg-subtle"
                    />
                  ))}

                {!tasksLoading && tasks.length === 0 && (
                  <p className="py-6 text-center text-sm text-foreground/50">
                    This scenario has no tasks.
                  </p>
                )}

                {!tasksLoading &&
                  tasks.map((task, i) => {
                    const isFaculty = task.verification === "faculty";
                    const interactive = isFaculty && !finalized;
                    const done = task.is_completed;
                    return (
                      <div
                        key={task.id}
                        onClick={() => interactive && handleToggle(task)}
                        style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                        className={`group relative animate-rise overflow-hidden rounded-xl border py-3.5 pl-5 pr-4 transition-all ${
                          done
                            ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                            : "border-hairline bg-surface"
                        } ${interactive ? "cursor-pointer hover:border-brand-500/50 hover:shadow-tile" : ""}`}
                      >
                        <span
                          className={`absolute inset-y-0 left-0 w-1 ${
                            done
                              ? "bg-emerald-500/70"
                              : isFaculty
                                ? "bg-violet-400/70"
                                : "bg-brand-500/70"
                          }`}
                        />
                        <div className="flex items-start gap-3.5">
                          {/* Checkbox */}
                          <div
                            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-all ${
                              busyTaskId === task.id ? "opacity-50" : ""
                            } ${
                              done
                                ? isFaculty
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-brand-600 bg-brand-600 text-white"
                                : isFaculty
                                  ? interactive
                                    ? "border-foreground/25 text-transparent group-hover:border-emerald-500"
                                    : "border-foreground/20 text-transparent"
                                  : "border-dashed border-brand-500/40 text-transparent"
                            }`}
                          >
                            {done ? (
                              <CheckIcon />
                            ) : !isFaculty ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-brand-500/60" />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <p
                                className={`font-semibold ${done ? "text-foreground" : "text-foreground/90"}`}
                              >
                                {task.title}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${categoryChip(task.category)}`}
                              >
                                {task.category}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  isFaculty
                                    ? "bg-violet-500/12 text-violet-600 dark:text-violet-300"
                                    : "bg-brand-500/12 text-brand-700 dark:text-brand-300"
                                }`}
                              >
                                {isFaculty ? "Faculty-verified" : "Auto"}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/55">{task.description}</p>
                            <p className="mt-1 text-xs text-foreground/40">
                              {task.is_completed
                                ? task.completed_via === "system"
                                  ? "Auto-completed from the student's charting"
                                  : "Verified by faculty"
                                : isFaculty
                                  ? interactive
                                    ? "Tap to mark verified"
                                    : "Awaiting verification"
                                  : "Completes from the student's charting"}
                            </p>
                          </div>

                          <span className="shrink-0 font-display text-sm font-bold tabular-nums text-foreground/70">
                            {task.points}
                            <span className="text-foreground/35"> pt</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Finalize bar */}
              <div className="flex flex-col gap-3 border-t border-hairline bg-subtle/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-foreground/55">
                  {finalized
                    ? "This assignment is finalized and locked."
                    : selected.submitted_at
                      ? "Student submitted — verify the hands-on tasks, then finalize."
                      : "Not submitted yet — you can still finalize when ready."}
                </p>
                <button
                  onClick={handleFinalize}
                  disabled={finalized || finalizing || tasksLoading}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-tile transition-all hover:bg-brand-700 hover:shadow-tile-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-600"
                >
                  {finalized ? (
                    <>
                      <CheckIcon className="h-4 w-4" /> Finalized
                    </>
                  ) : finalizing ? (
                    "Finalizing…"
                  ) : (
                    "Finalize & lock score"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
