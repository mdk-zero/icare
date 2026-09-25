"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faCheck,
  faChevronLeft,
  faClipboardCheck,
  faClipboardList,
  faLock,
  faMagnifyingGlass,
  faStopwatch,
  faTriangleExclamation,
  faUserGraduate,
} from "@fortawesome/free-solid-svg-icons";
import {
  ScenarioAssignment,
  GradingTask,
  fetchScenarioAssignments,
  fetchFacultyAssignmentTasks,
  saveTaskRating,
  saveStepRatings,
  finalizeScenarioAssignment,
} from "../../../lib/api";
import {
  DEFAULT_RUBRIC,
  TASK_RATINGS,
  gradedScore,
  ratingLabel,
  scoreDescriptor,
  type TaskRating,
} from "../../../lib/task-ratings";
import GradingTable from "./grading-table";
import {
  RATING_STYLE,
  checklistRows,
  hasCompletion,
  stepGrades,
  taskLevel,
  withRating,
  withStepChanges,
} from "./grading";
import { toast } from "../../../components/Toast";
import Avatar from "../../../components/Avatar";
import PageHeader from "../../../components/PageHeader";
import ConfirmModal from "../../../components/ConfirmModal";
import { usePageData } from "../../../lib/use-page-data";

type Grading = NonNullable<Awaited<ReturnType<typeof fetchFacultyAssignmentTasks>>>;

// Stable empty fallbacks, so the filter memos are not invalidated every render.
const NO_ASSIGNMENTS: ScenarioAssignment[] = [];
const NO_TASKS: GradingTask[] = [];
const NO_GRADING: Grading = {
  tasks: NO_TASKS,
  status: "pending",
  ratingsEnabled: true,
  stepsEnabled: true,
  rubric: DEFAULT_RUBRIC,
};

type Filter = "awaiting" | "in_progress" | "completed" | "all";

const FILTERS: { key: Filter; label: string; title: string }[] = [
  { key: "awaiting", label: "Awaiting", title: "Submitted, awaiting your review" },
  { key: "in_progress", label: "Ongoing", title: "Not submitted yet" },
  { key: "completed", label: "Finalized", title: "Graded and locked" },
  { key: "all", label: "All", title: "Every submission" },
];

function isAwaiting(a: ScenarioAssignment) {
  return Boolean(a.submitted_at) && a.status !== "completed";
}

function isOngoing(a: ScenarioAssignment) {
  return a.status !== "completed" && !a.submitted_at;
}

function matchesFilter(a: ScenarioAssignment, filter: Filter) {
  if (filter === "awaiting") return isAwaiting(a);
  if (filter === "in_progress") return isOngoing(a);
  if (filter === "completed") return a.status === "completed";
  return true;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const formatDay = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${Math.floor(minutes / 60)}h`;
}

/** Circular percentage gauge; `value` null draws an empty ring while loading. */
function ScoreRing({ value, final }: { value: number | null; final: boolean }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="7" className="stroke-hairline" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (clamped / 100) * circ}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${final ? "stroke-emerald-500" : "stroke-brand-600"}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold tabular-nums text-gray-900">
        {value === null ? "—" : `${clamped}%`}
      </span>
    </div>
  );
}

function EmptyPanel({ icon, title, body }: { icon: typeof faCheck; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-10 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-subtle text-gray-400">
        <FontAwesomeIcon icon={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mt-0.5 text-xs text-gray-500">{body}</p>
    </div>
  );
}

export default function FacultyScenarioReviewClient() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("awaiting");

  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Checklist rows (sub-task ids, or task ids for tasks without sub-tasks) mid-save.
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const gradingRef = useRef<HTMLElement>(null);

  // Notes being typed, and the criteria whose note box was opened, per task.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());

  const { data: assignmentsData, loading, setData: setAssignmentsData } = usePageData(
    "faculty:scenario-review",
    fetchScenarioAssignments,
  );
  const assignments = assignmentsData ?? NO_ASSIGNMENTS;
  const setAssignments = (update: (previous: ScenarioAssignment[]) => ScenarioAssignment[]) =>
    setAssignmentsData((previous) => update(previous ?? NO_ASSIGNMENTS));

  // Keyed by assignment, so clicking back through a list of submissions reads
  // each one's rubric from memory after the first look.
  const {
    data: gradingData,
    loading: tasksLoading,
    refresh: reloadTasks,
    setData: setGradingData,
  } = usePageData(
    selectedId ? `faculty:assignment-grading:${selectedId}` : null,
    async () => (await fetchFacultyAssignmentTasks(selectedId!)) ?? NO_GRADING,
  );
  const tasks = gradingData?.tasks ?? NO_TASKS;
  const ratingsEnabled = gradingData?.ratingsEnabled ?? true;
  const stepsEnabled = gradingData?.stepsEnabled ?? true;
  const setTasks = (update: (previous: GradingTask[]) => GradingTask[]) =>
    setGradingData((previous) => {
      const base = previous ?? NO_GRADING;
      return { ...base, tasks: update(base.tasks) };
    });

  const selected = assignments.find((a) => a.id === selectedId) ?? null;
  const finalized = selected?.status === "completed";

  /** One row per student, so the queue can be searched/picked before any
   * submissions are shown — grouping happens client-side since the API
   * still returns a flat list of assignments. */
  const studentGroups = useMemo(() => {
    const byStudent = new Map<
      string,
      Pick<ScenarioAssignment, "student_id" | "student_name" | "student_picture_url" | "student_sex"> & {
        assignments: ScenarioAssignment[];
      }
    >();
    for (const a of assignments) {
      const entry = byStudent.get(a.student_id);
      if (entry) entry.assignments.push(a);
      else
        byStudent.set(a.student_id, {
          student_id: a.student_id,
          student_name: a.student_name,
          student_picture_url: a.student_picture_url,
          student_sex: a.student_sex,
          assignments: [a],
        });
    }
    return Array.from(byStudent.values())
      .map((g) => ({
        ...g,
        awaiting: g.assignments.filter(isAwaiting).length,
        completed: g.assignments.filter((a) => a.status === "completed").length,
      }))
      .sort((a, b) => b.awaiting - a.awaiting || a.student_name.localeCompare(b.student_name));
  }, [assignments]);

  const filteredStudentGroups = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return studentGroups;
    return studentGroups.filter((g) => g.student_name.toLowerCase().includes(q));
  }, [studentGroups, studentQuery]);

  const selectedStudent = studentGroups.find((g) => g.student_id === selectedStudentId) ?? null;

  const resetNotes = () => {
    setNoteDrafts({});
    setOpenNotes(new Set());
  };

  const selectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setFilter("awaiting");
    setSelectedId(null);
    resetNotes();
  };

  const backToStudents = () => {
    setSelectedStudentId(null);
    setSelectedId(null);
    resetNotes();
  };

  const selectAssignment = (id: string) => {
    setSelectedId(id);
    resetNotes();
    // Stacked below the queue on narrow screens, the rubric would open out of sight.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => gradingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const studentAssignments = useMemo(
    () => assignments.filter((a) => a.student_id === selectedStudentId),
    [assignments, selectedStudentId],
  );
  const visible = useMemo(
    () => studentAssignments.filter((a) => matchesFilter(a, filter)),
    [studentAssignments, filter],
  );

  // --- The grade, as it stands ------------------------------------------------
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const projectedScore = gradedScore(
    tasks,
    new Map(tasks.filter(hasCompletion).map((t) => [t.id, { rating: t.rating }])),
    new Map(tasks.map((t) => [t.id, stepGrades(t)])),
  );
  // Always the live grade from `tasks`, not the assignment record's stored
  // score — that only matters to the queue list and other pages, which
  // `applyScore` keeps in sync after each edit (see handleRateTask/handleNoteBlur).
  const shownScore = projectedScore;
  // Every gradable row on the sheet: each sub-task, or a task that has none.
  const rows = tasks.flatMap(checklistRows);
  // Nothing recorded or rated yet: a 0% "Needs Improvement" would read as a verdict.
  const ungraded = !finalized && rows.every((r) => r.level === null);
  // shownScore now reads from `tasks` in every state, so loading gates it too.
  const gradePending = tasksLoading || ungraded;
  const ratedCount = rows.filter((r) => r.level !== null && !r.implied).length;
  const unratedMissing = rows.filter((r) => r.level === null).length;
  // Unrated rows that still count at their task's whole-task level, by level.
  const impliedByLevel = TASK_RATINGS.flatMap((level) => {
    const count = rows.filter((r) => r.implied && r.level === level.key).length;
    return count > 0 ? [{ level: level.key, count }] : [];
  });
  const unratedImplied = impliedByLevel.reduce((sum, g) => sum + g.count, 0);
  const rowNoun = (n: number) => (n === 1 ? "row" : "rows");

  const markSaving = (keys: readonly string[], saving: boolean) =>
    setSavingKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (saving) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  // Finalizing doesn't lock grading — this patches the queue's stored score
  // (and the student's) so a correction to an already-finalized grade shows
  // up immediately everywhere, not just in the panel that's open.
  const applyScore = (score: number | undefined) => {
    if (score === undefined || !selectedId) return;
    setAssignments((prev) => prev.map((a) => (a.id === selectedId ? { ...a, score } : a)));
  };

  const handleRateTask = async (task: GradingTask, rating: TaskRating | null) => {
    if (!selectedId || savingKeys.has(task.id)) return;
    const assignmentId = selectedId;
    markSaving([task.id], true);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? withRating(t, rating) : t)));
    const result = await saveTaskRating(assignmentId, task.id, { rating });
    if (result.ok) {
      applyScore(result.score);
    } else {
      toast(result.error, "error");
      await reloadTasks();
    }
    markSaving([task.id], false);
  };

  const handleRateSteps = async (task: GradingTask, changes: Map<string, TaskRating | null>) => {
    const keys = [...changes.keys()];
    if (!selectedId || keys.length === 0 || keys.some((k) => savingKeys.has(k))) return;
    const assignmentId = selectedId;
    markSaving(keys, true);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? withStepChanges(t, changes) : t)));
    const result = await saveStepRatings(
      assignmentId,
      task.id,
      keys.map((stepId) => ({ step_id: stepId, rating: changes.get(stepId) ?? null })),
    );
    if (result.ok) {
      applyScore(result.score);
    } else {
      toast(result.error, "error");
      await reloadTasks();
    }
    markSaving(keys, false);
  };

  const handleNoteBlur = async (task: GradingTask) => {
    if (!selectedId) return;
    const draft = noteDrafts[task.id];
    if (draft === undefined) return;
    const next = draft.trim() || null;
    if (next === (task.remarks ?? null)) return;
    const assignmentId = selectedId;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, remarks: next } : t)));
    const result = await saveTaskRating(assignmentId, task.id, { remarks: next });
    if (result.ok) {
      applyScore(result.score);
    } else {
      toast(result.error, "error");
      await reloadTasks();
    }
  };

  const handleFinalize = async () => {
    if (!selectedId || finalized) return;
    setFinalizing(true);
    const result = await finalizeScenarioAssignment(selectedId);
    if (result) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === selectedId
            ? { ...a, status: "completed", score: result.score, completed_at: new Date().toISOString() }
            : a,
        ),
      );
      await reloadTasks();
      toast(`Finalized — ${scoreDescriptor(result.score)} (${result.score}%)`);
      setConfirmOpen(false);
    } else {
      toast("Unable to finalize this grade. Please try again.", "error");
    }
    setFinalizing(false);
  };

  const awaitingCount = assignments.filter(isAwaiting).length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faClipboardCheck} className="h-3.5 w-3.5" />,
          label: "Scenario Management",
        }}
        title="Review Submissions"
        subtitle="Rate each criterion of a student's scenario on a verbal scale, add notes where it helps, then lock in the grade."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Back to scenarios
        </button>
        {awaitingCount > 0 && (
          <span className="ml-auto flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-700">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {awaitingCount} awaiting review
          </span>
        )}
      </div>

      {/* The queue narrows below 2xl so the checklist's six rating columns fit beside it. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Queue */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          {!selectedStudentId ? (
            <>
              {/* Step 1: find the student before any submission renders */}
              <div className="relative mb-3">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search a student…"
                  aria-label="Search students"
                  className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-10 pr-3.5 text-sm text-gray-900 shadow-tile outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
                />
              </div>

              <div className="space-y-2">
                {loading &&
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[68px] animate-pulse rounded-xl border border-hairline bg-subtle" />
                  ))}

                {!loading && filteredStudentGroups.length === 0 && (
                  <EmptyPanel
                    icon={faUserGraduate}
                    title={studentQuery ? "No students found" : "No submissions yet"}
                    body={studentQuery ? "Try a different name." : "Assigned scenarios show up here."}
                  />
                )}

                {!loading &&
                  filteredStudentGroups.map((g, i) => (
                    <button
                      key={g.student_id}
                      onClick={() => selectStudent(g.student_id)}
                      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                      className="flex w-full animate-rise items-center gap-3 rounded-xl border border-hairline bg-surface p-3 text-left shadow-tile transition-all hover:border-brand-300 hover:shadow-tile-hover"
                    >
                      <Avatar
                        name={g.student_name}
                        src={g.student_picture_url}
                        userId={g.student_id}
                        sex={g.student_sex}
                        size="md"
                        tone="solid"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900">{g.student_name}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {g.assignments.length} scenario{g.assignments.length === 1 ? "" : "s"}
                          {g.completed > 0 && ` · ${g.completed} finalized`}
                        </span>
                      </span>
                      {g.awaiting > 0 && (
                        <span
                          title={`${g.awaiting} awaiting review`}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-700"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          {g.awaiting}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              {/* Step 2: the chosen student's submissions */}
              <button
                onClick={backToStudents}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-surface p-3 text-left shadow-tile transition-colors hover:border-brand-300"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <Avatar
                  name={selectedStudent?.student_name}
                  src={selectedStudent?.student_picture_url}
                  userId={selectedStudent?.student_id}
                  sex={selectedStudent?.student_sex}
                  size="sm"
                  tone="solid"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {selectedStudent?.student_name}
                  </span>
                  <span className="block text-xs text-gray-500">Change student</span>
                </span>
              </button>

              <div
                role="tablist"
                aria-label="Filter submissions"
                className="mb-3 grid grid-cols-4 gap-1 rounded-xl border border-hairline bg-subtle p-1"
              >
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  const count = studentAssignments.filter((a) => matchesFilter(a, f.key)).length;
                  return (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(f.key)}
                      title={f.title}
                      className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-all ${
                        active ? "bg-surface text-gray-900 shadow-tile" : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      <span className="truncate">{f.label}</span>
                      <span className={`tabular-nums ${active ? "text-brand-600" : "text-gray-400"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {!loading && visible.length === 0 && (
                  <EmptyPanel icon={faCheck} title="All clear" body="Nothing in this view right now." />
                )}

                {visible.map((a, i) => {
                  const active = selectedId === a.id;
                  const done = a.status === "completed";
                  return (
                    <button
                      key={a.id}
                      onClick={() => selectAssignment(a.id)}
                      aria-current={active}
                      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                      className={`w-full animate-rise rounded-xl border p-3.5 text-left transition-all ${
                        active
                          ? "border-brand-600 bg-brand-50 shadow-tile"
                          : "border-hairline bg-surface shadow-tile hover:border-brand-300 hover:shadow-tile-hover"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-semibold leading-snug text-gray-900">{a.scenario_title}</p>
                        {done ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">
                            {a.score ?? 0}%
                          </span>
                        ) : isAwaiting(a) ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                            Awaiting
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
                            {a.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {done
                          ? `${scoreDescriptor(a.score ?? 0)}${a.completed_at ? ` · finalized ${formatDay(a.completed_at)}` : ""}`
                          : a.submitted_at
                            ? `Submitted ${formatWhen(a.submitted_at)}`
                            : a.deadline
                              ? `Due ${formatDay(a.deadline)}`
                              : "Not submitted"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>

        {/* Grading panel */}
        <section ref={gradingRef} className="scroll-mt-4">
          {!selected ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <FontAwesomeIcon icon={selectedStudentId ? faClipboardList : faUserGraduate} className="h-7 w-7" />
              </div>
              <p className="font-display text-lg font-semibold text-gray-900">
                {selectedStudentId ? "Pick a submission" : "Find a student"}
              </p>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                {selectedStudentId
                  ? "Choose a scenario from the list to rate each criterion and lock in a grade."
                  : "Search or select a student to see the scenarios they've submitted for review."}
              </p>
            </div>
          ) : (
            <div className="overflow-clip rounded-2xl border border-hairline bg-surface shadow-tile">
              {/* `overflow-clip`, not `-hidden`: it rounds off the square finalize
                  bar at the panel's end without becoming a scroll container,
                  which would pin that sticky bar to this box instead of the page. */}
              {/* Who, what, and the grade so far */}
              <div className="flex flex-col gap-5 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-start gap-3.5">
                  <Avatar
                    name={selected.student_name}
                    src={selected.student_picture_url}
                    userId={selected.student_id}
                    sex={selected.student_sex}
                    size="lg"
                    tone="solid"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl font-bold tracking-tight text-gray-900">
                      {selected.student_name}
                    </h2>
                    <p className="text-sm text-gray-500">{selected.scenario_title}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                        <FontAwesomeIcon icon={faCalendarCheck} className="h-3 w-3 text-gray-400" />
                        {selected.submitted_at ? `Submitted ${formatWhen(selected.submitted_at)}` : "Not submitted yet"}
                      </span>
                      {Boolean(selected.time_taken) && (
                        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 tabular-nums">
                          <FontAwesomeIcon icon={faStopwatch} className="h-3 w-3 text-gray-400" />
                          {formatDuration(selected.time_taken!)}
                        </span>
                      )}
                      {finalized && (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                          <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
                          Finalized
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4 sm:flex-row-reverse sm:text-right">
                  <ScoreRing value={gradePending ? null : shownScore} final={finalized} />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {finalized ? "Final grade" : "Projected grade"}
                    </p>
                    <p className="font-display text-2xl font-bold tracking-tight text-gray-900">
                      {gradePending ? (ungraded ? "Not graded yet" : "—") : scoreDescriptor(shownScore)}
                    </p>
                  </div>
                </div>
              </div>

              {/* How the grade is composed: one segment per task, as wide as its weight */}
              {!tasksLoading && tasks.length > 0 && (
                <div className="border-b border-hairline px-5 py-4 sm:px-6">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-gray-700">
                      {finalized ? "Grade breakdown" : `${ratedCount} of ${rows.length} checklist rows rated`}
                    </span>
                    <span className="text-gray-400">Bar width = task weight</span>
                  </div>
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                    {tasks.map((t) => {
                      const { level, implied } = taskLevel(t);
                      return (
                        <span
                          key={t.id}
                          title={`${t.title}: ${level ? ratingLabel(level) : "Not rated"}`}
                          style={{ flexGrow: Math.max(t.points, 1) }}
                          className={`basis-0 transition-colors duration-300 ${
                            level ? RATING_STYLE[level].dot : "bg-gray-200"
                          } ${level && implied && !finalized ? "opacity-45" : ""}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {!ratingsEnabled && (
                <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Ratings can&apos;t be saved yet — database migration 043 (scenario task ratings) hasn&apos;t been
                    applied. Existing check-offs still count at full credit.
                  </p>
                </div>
              )}
              {ratingsEnabled && !stepsEnabled && (
                <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Sub-task checklists appear once database migration 044 (scenario task steps) is applied. Until
                    then each task is rated as a whole.
                  </p>
                </div>
              )}

              {/* The checklist */}
              <GradingTable
                tasks={tasks}
                loading={tasksLoading}
                totalPoints={totalPoints}
                rubric={gradingData?.rubric ?? DEFAULT_RUBRIC}
                savingKeys={savingKeys}
                onRateTask={handleRateTask}
                onRateSteps={handleRateSteps}
                noteDrafts={noteDrafts}
                openNotes={openNotes}
                onOpenNote={(taskId) => setOpenNotes((open) => new Set(open).add(taskId))}
                onNoteChange={(taskId, value) => setNoteDrafts((d) => ({ ...d, [taskId]: value }))}
                onNoteBlur={handleNoteBlur}
              />

              {/* Finalize — opaque, not translucent: this sits over the criteria
                  list while stuck mid-scroll, and a `bg-surface/NN` + blur let
                  that list show through it instead of reading as a solid bar.
                  `isolate` + an explicit z-index take it out of the ambiguous
                  z-index:auto paint order it'd otherwise share with the
                  checklist's sticky first-column cells (each `position:
                  sticky`) — without them a fast scroll could momentarily
                  paint a row on top of this bar instead of under it.

                  A sticky inset counts from inside the scroller's padding, so
                  `bottom-0` parked the bar one padding (Shell's `p-3 lg:p-5`)
                  above the window's edge, and rows scrolled by in the strip
                  beneath it. The negative inset cancels that padding, docking
                  the bar flush with the edge; keep it in step with Shell's.
                  Square corners, since docked mid-panel it meets the edge —
                  the panel's `overflow-clip` rounds them off at its end. */}
              <div className="isolate z-10 -bottom-3 flex flex-col gap-3 border-t border-hairline bg-surface px-5 py-4 sm:sticky sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-bottom-5">
                <div className="min-w-0 text-sm">
                  {finalized ? (
                    <p className="text-gray-600">
                      Graded <span className="font-semibold text-gray-900">{scoreDescriptor(shownScore)}</span>{" "}
                      ({shownScore}%){selected.completed_at ? ` on ${formatDay(selected.completed_at)}` : ""}. You
                      can still adjust ratings above — the grade updates right away.
                    </p>
                  ) : (
                    <>
                      <p className="text-gray-600">
                        Overall{" "}
                        <span className="font-semibold text-gray-900">
                          {ungraded ? "not graded yet" : `${scoreDescriptor(projectedScore)} · ${projectedScore}%`}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {unratedMissing > 0
                          ? `${unratedMissing} unrated ${rowNoun(unratedMissing)} ${unratedMissing === 1 ? "earns" : "earn"} no points`
                          : !selected.submitted_at
                            ? "Not submitted yet — you can still grade it now"
                            : unratedImplied > 0
                              ? `${unratedImplied} auto-completed ${rowNoun(unratedImplied)} still to confirm`
                              : "Every row has a grade"}
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={finalized || finalizing || tasksLoading || tasks.length === 0}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-tile transition-all hover:bg-brand-700 hover:shadow-tile-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-600"
                >
                  <FontAwesomeIcon icon={finalized ? faCheck : faLock} className="h-3.5 w-3.5" />
                  {finalized ? "Finalized" : "Finalize grade"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {confirmOpen && selected && (
        <ConfirmModal
          config={{
            title: "Finalize this grade?",
            message: (
              <>
                {selected.student_name} receives{" "}
                <span className="font-semibold text-gray-900">
                  {scoreDescriptor(projectedScore)} ({projectedScore}%)
                </span>{" "}
                for {selected.scenario_title}. Ratings and notes lock once finalized.
              </>
            ),
            confirmLabel: "Finalize grade",
            danger: false,
            loading: finalizing,
            onConfirm: handleFinalize,
            children:
              unratedMissing + unratedImplied > 0 ? (
                <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {unratedMissing > 0 && (
                    <li>
                      {unratedMissing} unrated checklist {rowNoun(unratedMissing)} will earn no points.
                    </li>
                  )}
                  {impliedByLevel.map(({ level, count }) => (
                    <li key={level}>
                      {count} {rowNoun(count)} you haven&apos;t rated will count as {ratingLabel(level)}, the level
                      {count === 1 ? " its task has" : " their tasks have"} as a whole.
                    </li>
                  ))}
                </ul>
              ) : undefined,
          }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
