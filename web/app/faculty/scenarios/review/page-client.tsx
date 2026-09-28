"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faCheck,
  faChevronLeft,
  faClipboardCheck,
  faClipboardList,
  faHourglassHalf,
  faLock,
  faPenToSquare,
  faFloppyDisk,
  faRotateLeft,
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
  fetchGradeEditState,
  requestGradeEdit,
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
import ConfirmModal from "../../../components/ConfirmModal";
import { onNotificationArrival } from "../../../lib/notifications-live";
import Avatar from "../../../components/Avatar";
import { EcgLoader } from "../../../components/EcgLoader";
import PageHeader from "../../../components/PageHeader";
import { usePageData } from "../../../lib/use-page-data";

type Grading = NonNullable<Awaited<ReturnType<typeof fetchFacultyAssignmentTasks>>>;

// Stable empty fallbacks, so the filter memos are not invalidated every render.
const NO_ASSIGNMENTS: ScenarioAssignment[] = [];
const NO_TASKS: GradingTask[] = [];

/** Team names in natural order ("Team 2" before "Team 10"), students without a team last. */
const compareTeams = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { numeric: true });
const NO_GRADING: Grading = {
  tasks: NO_TASKS,
  status: "pending",
  ratingsEnabled: true,
  stepsEnabled: true,
  rubric: DEFAULT_RUBRIC,
};

/**
 * A scenario is either Assigned (the student is working on it, or has
 * submitted it and it waits for your grade) or Completed (graded and locked).
 */
type Filter = "assigned" | "completed" | "all";

const FILTERS: { key: Filter; label: string; title: string }[] = [
  { key: "assigned", label: "Assigned", title: "Not graded yet, submitted or not" },
  { key: "completed", label: "Completed", title: "Graded and locked" },
  { key: "all", label: "All", title: "Every scenario" },
];

/** Submitted and waiting for a grade — still Assigned, but the ones to grade first. */
function isSubmitted(a: ScenarioAssignment) {
  return Boolean(a.submitted_at) && a.status !== "completed";
}

function matchesFilter(a: ScenarioAssignment, filter: Filter) {
  if (filter === "assigned") return a.status !== "completed";
  if (filter === "completed") return a.status === "completed";
  return true;
}

/** The group filter: every group, one group by name, or students in none. */
const ALL_GROUPS = "__all";
const NO_GROUP = "__none";

/** Whether a task's grade on the sheet differs from the one saved. Notes are tracked apart. */
const gradeChanged = (t: GradingTask, saved: GradingTask) =>
  t.rating !== saved.rating ||
  t.completed_via !== saved.completed_via ||
  t.steps.some((s, i) => s.rating !== saved.steps[i]?.rating);

/** Matches the edit-request route's limit (grade-edit-requests.ts). */
const MAX_REASON_LENGTH = 500;

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
  const [filter, setFilter] = useState<Filter>("assigned");

  const [studentQuery, setStudentQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  // A saved grade opens locked; Edit unlocks it until the next Save.
  const [editing, setEditing] = useState(false);

  const gradingRef = useRef<HTMLElement>(null);

  // Ratings clicked since the last save, as the whole sheet; null when there are none.
  // Nothing reaches the server until Save, so it is kept apart from the cached grading.
  const [draftTasks, setDraftTasks] = useState<GradingTask[] | null>(null);

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
  } = usePageData(
    selectedId ? `faculty:assignment-grading:${selectedId}` : null,
    async () => (await fetchFacultyAssignmentTasks(selectedId!)) ?? NO_GRADING,
  );
  const savedTasks = gradingData?.tasks ?? NO_TASKS;
  const tasks = draftTasks ?? savedTasks;
  const ratingsEnabled = gradingData?.ratingsEnabled ?? true;
  const stepsEnabled = gradingData?.stepsEnabled ?? true;
  const setTasks = (update: (previous: GradingTask[]) => GradingTask[]) =>
    setDraftTasks((previous) => update(previous ?? savedTasks));

  const selected = assignments.find((a) => a.id === selectedId) ?? null;
  const finalized = selected?.status === "completed";
  const locked = finalized && !editing;

  // A saved grade changes only with an admin's approval; this is where the
  // faculty member stands on this one.
  const { data: editState, refresh: refreshEditState } = usePageData(
    finalized && selectedId ? `faculty:grade-edit:${selectedId}` : null,
    () => fetchGradeEditState(selectedId!),
  );
  // The admin's answer arrives as a notification: re-check when one lands.
  useEffect(() => onNotificationArrival(() => void refreshEditState()), [refreshEditState]);
  const [requestReason, setRequestReason] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  /** One row per student, so the queue can be searched/picked before any
   * submissions are shown — grouping happens client-side since the API
   * still returns a flat list of assignments. */
  const studentGroups = useMemo(() => {
    const byStudent = new Map<
      string,
      Pick<ScenarioAssignment, "student_id" | "student_name" | "student_picture_url" | "student_sex" | "team_id" | "team_name"> & {
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
          team_id: a.team_id ?? null,
          // The section-qualified label, since group names repeat across sections.
          team_name: a.team_label ?? a.team_name ?? null,
          assignments: [a],
        });
    }
    return Array.from(byStudent.values())
      .map((g) => ({
        ...g,
        awaiting: g.assignments.filter(isSubmitted).length,
        completed: g.assignments.filter((a) => a.status === "completed").length,
      }))
      // Grouped by team (students without one last), then who needs review first.
      .sort(
        (a, b) =>
          compareTeams(a.team_name ?? null, b.team_name ?? null) ||
          b.awaiting - a.awaiting ||
          a.student_name.localeCompare(b.student_name),
      );
  }, [assignments]);
  const hasTeams = studentGroups.some((g) => g.team_name);
  // One chip per group id (names repeat across sections), in label order.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const g of studentGroups) if (g.team_id) byId.set(g.team_id, g.team_name ?? "Group");
    return [...byId].map(([key, label]) => ({ key, label })).sort((a, b) => compareTeams(a.label, b.label));
  }, [studentGroups]);
  const hasUngrouped = studentGroups.some((g) => !g.team_name);

  const filteredStudentGroups = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return studentGroups.filter(
      (g) =>
        (groupFilter === ALL_GROUPS ||
          (groupFilter === NO_GROUP ? !g.team_id : g.team_id === groupFilter)) &&
        (!q || g.student_name.toLowerCase().includes(q) || (g.team_name ?? "").toLowerCase().includes(q)),
    );
  }, [studentGroups, studentQuery, groupFilter]);

  const selectedStudent = studentGroups.find((g) => g.student_id === selectedStudentId) ?? null;

  /** Averages over one group's individual grades, when a group chip is picked. */
  const selectedGroupStats = useMemo(() => {
    if (groupFilter === ALL_GROUPS || groupFilter === NO_GROUP) return null;
    const work = studentGroups.filter((g) => g.team_id === groupFilter).flatMap((g) => g.assignments);
    const graded = work.filter((a) => a.status === "completed" && typeof a.score === "number");
    return {
      assigned: work.length,
      graded: graded.length,
      average: graded.length
        ? Math.round(graded.reduce((sum, a) => sum + (a.score ?? 0), 0) / graded.length)
        : null,
      cases: new Set(work.map((a) => a.scenario_id)).size,
    };
  }, [studentGroups, groupFilter]);

  // --- Unsaved changes -------------------------------------------------------
  const savedById = useMemo(() => new Map(savedTasks.map((t) => [t.id, t])), [savedTasks]);
  /** The note typed for a task, if it differs from the saved one; undefined when unchanged. */
  const changedNote = (t: GradingTask): string | null | undefined => {
    const draft = noteDrafts[t.id];
    if (draft === undefined) return undefined;
    const next = draft.trim() || null;
    return next === (savedById.get(t.id)?.remarks ?? null) ? undefined : next;
  };
  const changedTasks = tasks.filter((t) => {
    const saved = savedById.get(t.id);
    return saved && (gradeChanged(t, saved) || (changedNote(t) !== undefined && hasCompletion(t)));
  });
  const dirty = changedTasks.length > 0;

  // Leaving the page drops the draft, so ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const confirmDiscard = () => !dirty || window.confirm("Discard your unsaved ratings and notes?");

  const resetDraft = () => {
    setDraftTasks(null);
    setNoteDrafts({});
    setOpenNotes(new Set());
  };

  const discardChanges = () => {
    resetDraft();
    setEditing(false);
  };

  const selectStudent = (studentId: string) => {
    if (!confirmDiscard()) return;
    setSelectedStudentId(studentId);
    setFilter("assigned");
    setSelectedId(null);
    resetDraft();
  };

  const backToStudents = () => {
    if (!confirmDiscard()) return;
    setSelectedStudentId(null);
    setSelectedId(null);
    resetDraft();
  };

  const selectAssignment = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return;
    setSelectedId(id);
    setEditing(false);
    resetDraft();
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
  // Always the grade on the sheet, unsaved clicks included, not the assignment
  // record's stored score — that only changes when Save goes through.
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

  // Clicks only change the sheet; Save sends them.
  const handleRateTask = (task: GradingTask, rating: TaskRating | null) => {
    if (locked || finalizing) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? withRating(t, rating) : t)));
  };

  const handleRateSteps = (task: GradingTask, changes: Map<string, TaskRating | null>) => {
    if (locked || finalizing || changes.size === 0) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? withStepChanges(t, changes) : t)));
  };

  /** Sends every changed rating and note; false (after a toast) if one was refused. */
  const saveChanges = async (assignmentId: string): Promise<boolean> => {
    for (const t of changedTasks) {
      const saved = savedById.get(t.id)!;
      const note = hasCompletion(t) ? changedNote(t) : undefined;
      const requests: Promise<Awaited<ReturnType<typeof saveTaskRating>>>[] = [];
      if (t.steps.length > 0) {
        // Every sub-task's final level, so the server lands exactly on the sheet.
        if (gradeChanged(t, saved)) {
          const result = await saveStepRatings(
            assignmentId,
            t.id,
            t.steps.map((s) => ({ step_id: s.id, rating: s.rating })),
          );
          if (!result.ok) {
            toast(result.error, "error");
            return false;
          }
        }
        // A note hangs on the completion row the sub-task ratings just wrote.
        if (note !== undefined) requests.push(saveTaskRating(assignmentId, t.id, { remarks: note }));
      } else {
        const grade: { rating?: TaskRating | null; remarks?: string | null } = {};
        if (gradeChanged(t, saved)) grade.rating = t.rating;
        if (note !== undefined) grade.remarks = note;
        requests.push(saveTaskRating(assignmentId, t.id, grade));
      }
      for (const result of await Promise.all(requests)) {
        if (!result.ok) {
          toast(result.error, "error");
          return false;
        }
      }
    }
    return true;
  };

  /** Save the grade: the scenario becomes Completed and the student sees it. Saving an edit re-scores it. */
  const handleSave = async () => {
    if (!selectedId) return;
    const assignmentId = selectedId;
    setFinalizing(true);
    if (!(await saveChanges(assignmentId))) {
      // Some changes may have landed: re-read what was saved, and keep the draft to retry.
      await reloadTasks();
      setFinalizing(false);
      return;
    }
    const result = await finalizeScenarioAssignment(assignmentId);
    if (result) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId
            ? { ...a, status: "completed", score: result.score, completed_at: a.completed_at ?? new Date().toISOString() }
            : a,
        ),
      );
      await reloadTasks();
      resetDraft();
      // Saving an approved edit used the approval up.
      if (finalized) void refreshEditState();
      toast(`Saved — ${scoreDescriptor(result.score)} (${result.score}%)`);
      setEditing(false);
    } else {
      await reloadTasks();
      toast("Unable to save the grade. Please try again.", "error");
    }
    setFinalizing(false);
  };

  /** Edit a saved grade: straight in once approved, otherwise ask the admin. */
  const handleEdit = async () => {
    if (!selectedId) return;
    const state = await fetchGradeEditState(selectedId);
    void refreshEditState();
    if (!state) {
      toast("Couldn't check whether you may change this grade. Please try again.", "error");
    } else if (state.status === "accepted" || state.status === "not_required") {
      setEditing(true);
    } else if (state.status === "pending") {
      toast("Your request is still waiting for your dean's answer.");
    } else {
      setRequestError(null);
      setRequestReason("");
    }
  };

  const sendEditRequest = async () => {
    if (!selectedId || requestReason === null) return;
    const reason = requestReason.trim();
    if (!reason) {
      setRequestError("Say why the grade needs to change.");
      return;
    }
    setRequesting(true);
    const result = await requestGradeEdit(selectedId, reason);
    setRequesting(false);
    if (!result.ok) {
      setRequestError(result.error);
      return;
    }
    setRequestReason(null);
    void refreshEditState();
    toast("Request sent. You'll be notified when your dean answers.");
  };

  const submittedCount = assignments.filter(isSubmitted).length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faClipboardCheck} className="h-3.5 w-3.5" />,
          label: "Scenario Management",
        }}
        title="Review Submissions"
        subtitle="Rate each criterion of a student's scenario on a verbal scale, add notes where it helps, then save the grade — you can edit it later."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => confirmDiscard() && router.push("/faculty/scenarios")}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Back to scenarios
        </button>
        {submittedCount > 0 && (
          <span className="ml-auto flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-700">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {submittedCount} submitted, not yet graded
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

              {/* Filter by group */}
              {hasTeams && (
                <div role="group" aria-label="Filter by group" className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    { key: ALL_GROUPS, label: "All groups" },
                    ...groupOptions,
                    ...(hasUngrouped ? [{ key: NO_GROUP, label: "No group" }] : []),
                  ].map((option) => {
                    const active = groupFilter === option.key;
                    const count =
                      option.key === ALL_GROUPS
                        ? studentGroups.length
                        : studentGroups.filter((g) =>
                            option.key === NO_GROUP ? !g.team_id : g.team_id === option.key,
                          ).length;
                    return (
                      <button
                        key={option.key}
                        onClick={() => setGroupFilter(option.key)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-gray-200 bg-surface text-gray-600 hover:border-brand-300 hover:text-gray-900"
                        }`}
                      >
                        {option.label}
                        <span className={`tabular-nums ${active ? "text-white/80" : "text-gray-400"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedGroupStats && (
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-hairline bg-subtle p-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {selectedGroupStats.average === null ? "—" : `${selectedGroupStats.average}%`}
                    </p>
                    <p className="text-[11px] text-gray-500">Group average</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {selectedGroupStats.graded}/{selectedGroupStats.assigned}
                    </p>
                    <p className="text-[11px] text-gray-500">Graded</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{selectedGroupStats.cases}</p>
                    <p className="text-[11px] text-gray-500">Different cases</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {loading &&
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[68px] animate-pulse rounded-xl border border-hairline bg-subtle" />
                  ))}

                {!loading && filteredStudentGroups.length === 0 && (
                  <EmptyPanel
                    icon={faUserGraduate}
                    title={studentQuery || groupFilter !== ALL_GROUPS ? "No students found" : "No scenarios yet"}
                    body={
                      studentQuery || groupFilter !== ALL_GROUPS
                        ? "Try a different name or group."
                        : "Assigned scenarios show up here."
                    }
                  />
                )}

                {!loading &&
                  filteredStudentGroups.map((g, i) => (
                    <Fragment key={g.student_id}>
                    {hasTeams && (i === 0 || filteredStudentGroups[i - 1].team_id !== g.team_id) && (
                      <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 first:pt-0">
                        {g.team_name ?? "No group"}
                      </p>
                    )}
                    <button
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
                          {g.completed > 0 && ` · ${g.completed} completed`}
                        </span>
                      </span>
                      {g.awaiting > 0 && (
                        <span
                          title={`${g.awaiting} submitted, not yet graded`}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-700"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          {g.awaiting}
                        </span>
                      )}
                    </button>
                    </Fragment>
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
                className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-subtle p-1"
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
                        ) : (
                          <span
                            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isSubmitted(a) ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isSubmitted(a) && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                            Assigned
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {done
                          ? `${scoreDescriptor(a.score ?? 0)}${a.completed_at ? ` · completed ${formatDay(a.completed_at)}` : ""}`
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
                          Completed
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
                readOnly={locked || finalizing}
                onRateTask={handleRateTask}
                onRateSteps={handleRateSteps}
                noteDrafts={noteDrafts}
                openNotes={openNotes}
                onOpenNote={(taskId) => setOpenNotes((open) => new Set(open).add(taskId))}
                onNoteChange={(taskId, value) => setNoteDrafts((d) => ({ ...d, [taskId]: value }))}
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
                  {locked ? (
                    <>
                      <p className="text-gray-600">
                        Saved as <span className="font-semibold text-gray-900">{scoreDescriptor(shownScore)}</span>{" "}
                        ({shownScore}%){selected.completed_at ? ` on ${formatDay(selected.completed_at)}` : ""}.
                      </p>
                      <p className="text-xs text-gray-400">
                        {editState?.status === "not_required"
                          ? "Edit to change a rating or note."
                          : editState?.status === "accepted"
                            ? `${editState.resolved_by_name ?? "Your dean"} approved a change. Saving it uses the approval up.`
                            : editState?.status === "pending"
                              ? `Change requested ${formatWhen(editState.requested_at)} and waiting for your dean.`
                              : editState?.status === "declined"
                                ? `${editState.resolved_by_name ?? "Your dean"} declined your last request. You can ask again.`
                                : "Changing a saved grade needs your dean's permission."}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">
                        Overall{" "}
                        <span className="font-semibold text-gray-900">
                          {ungraded ? "not graded yet" : `${scoreDescriptor(projectedScore)} · ${projectedScore}%`}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {dirty && (
                          <span className="font-medium text-amber-600">
                            Unsaved changes on {changedTasks.length} {changedTasks.length === 1 ? "task" : "tasks"} ·{" "}
                          </span>
                        )}
                        {unratedMissing > 0
                          ? `${unratedMissing} unrated ${rowNoun(unratedMissing)} ${unratedMissing === 1 ? "earns" : "earn"} no points`
                          : !selected.submitted_at
                            ? "Not submitted yet — you can still grade it now"
                            : unratedImplied > 0
                              ? `${unratedImplied} auto-completed ${rowNoun(unratedImplied)} count as their task's level until rated`
                              : "Every row has a grade"}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {locked ? (
                    <button
                      onClick={handleEdit}
                      disabled={editState?.status === "pending"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-600 bg-surface px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-tile transition-all hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500 disabled:hover:bg-surface"
                    >
                      <FontAwesomeIcon
                        icon={editState?.status === "pending" ? faHourglassHalf : faPenToSquare}
                        className="h-3.5 w-3.5"
                      />
                      {editState?.status === "pending"
                        ? "Awaiting approval"
                        : editState?.status === "accepted" || editState?.status === "not_required"
                          ? "Edit"
                          : "Request edit"}
                    </button>
                  ) : (
                    <>
                    {(dirty || finalized) && (
                      <button
                        onClick={discardChanges}
                        disabled={finalizing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-tile transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
                        {finalized ? "Cancel" : "Discard"}
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={finalizing || tasksLoading || tasks.length === 0 || ungraded}
                      title={ungraded ? "Rate at least one row first" : undefined}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-tile transition-all hover:bg-brand-700 hover:shadow-tile-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-600"
                    >
                      {finalizing ? <EcgLoader /> : <FontAwesomeIcon icon={faFloppyDisk} className="h-3.5 w-3.5" />}
                      {finalizing ? "Saving…" : "Save"}
                    </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {requestReason !== null && selected && (
        <ConfirmModal
          onClose={() => setRequestReason(null)}
          config={{
            title: "Ask to change this grade",
            message: `${selected.student_name}'s grade on "${selected.scenario_title}" is saved. Your dean will be notified, and you can edit it once they accept.`,
            confirmLabel: "Send request",
            danger: false,
            loading: requesting,
            error: requestError,
            onConfirm: sendEditRequest,
            children: (
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                autoFocus
                rows={4}
                maxLength={MAX_REASON_LENGTH}
                placeholder="Why does the grade need to change?"
                aria-label="Reason for changing the grade"
                className="mt-3 w-full resize-y rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
              />
            ),
          }}
        />
      )}
    </div>
  );
}
