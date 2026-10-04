"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faCalendarDay,
  faChevronDown,
  faFloppyDisk,
  faHourglassHalf,
  faLock,
  faPenToSquare,
  faRotateLeft,
  faStopwatch,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  ScenarioAssignment,
  GradingTask,
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
import { formatDay, formatWhen } from "./assignment-list";
import { toast } from "../../../components/Toast";
import ConfirmModal from "../../../components/ConfirmModal";
import { onNotificationArrival } from "../../../lib/notifications-live";
import Avatar from "../../../components/Avatar";
import { EcgLoader } from "../../../components/EcgLoader";
import { usePageData } from "../../../lib/use-page-data";

type Grading = NonNullable<
  Awaited<ReturnType<typeof fetchFacultyAssignmentTasks>>
>;

const NO_TASKS: GradingTask[] = [];
const NO_GRADING: Grading = {
  tasks: NO_TASKS,
  status: "pending",
  ratingsEnabled: true,
  stepsEnabled: true,
  rubric: DEFAULT_RUBRIC,
};

/** Whether a task's grade on the sheet differs from the one saved. Notes are tracked apart. */
const gradeChanged = (t: GradingTask, saved: GradingTask) =>
  t.rating !== saved.rating ||
  t.completed_via !== saved.completed_via ||
  t.steps.some((s, i) => s.rating !== saved.steps[i]?.rating);

/** Matches the edit-request route's limit (grade-edit-requests.ts). */
const MAX_REASON_LENGTH = 500;

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest
    ? `${Math.floor(minutes / 60)}h ${rest}m`
    : `${Math.floor(minutes / 60)}h`;
}

/** Circular percentage gauge; `value` null draws an empty ring while loading. */
function ScoreRing({ value, final }: { value: number | null; final: boolean }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-hairline"
        />
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

/** Title, status, due date and submission of one scenario: the header on a student's profile. */
export function ScenarioInfo({
  assignment,
}: {
  assignment: ScenarioAssignment;
}) {
  return (
    <div className="min-w-0">
      <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-gray-900">
        {assignment.scenario_title}
      </h2>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-600">
        {assignment.status === "completed" ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
            Completed
          </span>
        ) : (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
              assignment.submitted_at
                ? "bg-brand-50 text-brand-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {assignment.submitted_at && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            )}
            Assigned
          </span>
        )}
        {assignment.deadline && (
          <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
            <FontAwesomeIcon
              icon={faCalendarDay}
              className="h-3 w-3 text-gray-400"
            />
            Due {formatDay(assignment.deadline)}
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
          <FontAwesomeIcon
            icon={faCalendarCheck}
            className="h-3 w-3 text-gray-400"
          />
          {assignment.submitted_at
            ? `Submitted ${formatWhen(assignment.submitted_at)}`
            : "Not submitted yet"}
        </span>
        {Boolean(assignment.time_taken) && (
          <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 tabular-nums">
            <FontAwesomeIcon
              icon={faStopwatch}
              className="h-3 w-3 text-gray-400"
            />
            {formatDuration(assignment.time_taken!)}
          </span>
        )}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-gray-500"
    >
      <FontAwesomeIcon
        icon={faChevronDown}
        className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      />
    </span>
  );
}

/** A header row that toggles its card: clickable, and a button to the keyboard. */
function collapseProps(onToggle: () => void, label: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: onToggle,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
  };
}

/**
 * A scenario folded to its header: what it is, and its saved grade (or that
 * it has none yet). Opening it shows the full checklist in its place.
 */
export function ScenarioSummaryCard({
  assignment,
  onExpand,
}: {
  assignment: ScenarioAssignment;
  onExpand: () => void;
}) {
  const done = assignment.status === "completed";
  const score = done ? (assignment.score ?? 0) : null;
  return (
    <div className="overflow-clip rounded-2xl border border-hairline bg-surface shadow-tile">
      <div
        {...collapseProps(onExpand, `Open ${assignment.scenario_title}`)}
        aria-expanded={false}
        className="flex cursor-pointer flex-col gap-5 p-5 transition-colors hover:bg-subtle/60 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <ScenarioInfo assignment={assignment} />
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-4 sm:flex-row-reverse sm:text-right">
            <ScoreRing value={score} final={done} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {done ? "Final grade" : "Projected grade"}
              </p>
              <p className="font-display text-2xl font-bold tracking-tight text-gray-900">
                {score === null ? "Not graded yet" : scoreDescriptor(score)}
              </p>
            </div>
          </div>
          <Chevron open={false} />
        </div>
      </div>
    </div>
  );
}

/**
 * One student's scenario, graded on the checklist: the grade so far, the
 * rating sheet, and Save / Edit. Used by Review Submissions and by the
 * Scenarios tab of a student's profile. Mount it with `key={assignment.id}`
 * so switching scenarios starts from a clean sheet.
 */
export default function AssignmentGrader({
  assignment,
  onAssignmentChange,
  onDirtyChange,
  header = "student",
  onCollapse,
}: {
  assignment: ScenarioAssignment;
  /**
   * What the sheet's header leads with: the student (Review Submissions), or
   * the scenario (a student's own profile, where who is already clear).
   */
  header?: "student" | "scenario";
  /** Makes the header fold the sheet back into its summary card. */
  onCollapse?: () => void;
  /** The assignment as the server now has it, after a save. */
  onAssignmentChange: (patch: Partial<ScenarioAssignment>) => void;
  /** Whether there are ratings or notes not saved yet, so the parent can ask before leaving. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const selected = assignment;
  const selectedId = assignment.id;
  const [finalizing, setFinalizing] = useState(false);
  // A saved grade opens locked; Edit unlocks it until the next Save.
  const [editing, setEditing] = useState(false);

  // Ratings clicked since the last save, as the whole sheet; null when there are none.
  // Nothing reaches the server until Save, so it is kept apart from the cached grading.
  const [draftTasks, setDraftTasks] = useState<GradingTask[] | null>(null);

  // Notes being typed, and the criteria whose note box was opened, per task.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());

  // Keyed by assignment, so clicking back through a list of submissions reads
  // each one's rubric from memory after the first look.
  const {
    data: gradingData,
    loading: tasksLoading,
    refresh: reloadTasks,
  } = usePageData(
    `faculty:assignment-grading:${selectedId}`,
    async () => (await fetchFacultyAssignmentTasks(selectedId)) ?? NO_GRADING,
  );
  const savedTasks = gradingData?.tasks ?? NO_TASKS;
  const tasks = draftTasks ?? savedTasks;
  const ratingsEnabled = gradingData?.ratingsEnabled ?? true;
  const stepsEnabled = gradingData?.stepsEnabled ?? true;
  const setTasks = (update: (previous: GradingTask[]) => GradingTask[]) =>
    setDraftTasks((previous) => update(previous ?? savedTasks));

  const finalized = selected.status === "completed";
  const locked = finalized && !editing;

  // A saved grade changes only with an admin's approval; this is where the
  // faculty member stands on this one.
  const { data: editState, refresh: refreshEditState } = usePageData(
    finalized && selectedId ? `faculty:grade-edit:${selectedId}` : null,
    () => fetchGradeEditState(selectedId!),
  );
  // The admin's answer arrives as a notification: re-check when one lands.
  useEffect(
    () => onNotificationArrival(() => void refreshEditState()),
    [refreshEditState],
  );
  const [requestReason, setRequestReason] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  // --- Unsaved changes -------------------------------------------------------
  const savedById = useMemo(
    () => new Map(savedTasks.map((t) => [t.id, t])),
    [savedTasks],
  );
  /** The note typed for a task, if it differs from the saved one; undefined when unchanged. */
  const changedNote = (t: GradingTask): string | null | undefined => {
    const draft = noteDrafts[t.id];
    if (draft === undefined) return undefined;
    const next = draft.trim() || null;
    return next === (savedById.get(t.id)?.remarks ?? null) ? undefined : next;
  };
  const changedTasks = tasks.filter((t) => {
    const saved = savedById.get(t.id);
    return (
      saved &&
      (gradeChanged(t, saved) ||
        (changedNote(t) !== undefined && hasCompletion(t)))
    );
  });
  const dirty = changedTasks.length > 0;

  // Leaving the page drops the draft, so ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const resetDraft = () => {
    setDraftTasks(null);
    setNoteDrafts({});
    setOpenNotes(new Set());
  };

  const discardChanges = () => {
    resetDraft();
    setEditing(false);
  };

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // --- The grade, as it stands ------------------------------------------------
  const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const projectedScore = gradedScore(
    tasks,
    new Map(
      tasks.filter(hasCompletion).map((t) => [t.id, { rating: t.rating }]),
    ),
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
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? withRating(t, rating) : t)),
    );
  };

  const handleRateSteps = (
    task: GradingTask,
    changes: Map<string, TaskRating | null>,
  ) => {
    if (locked || finalizing || changes.size === 0) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? withStepChanges(t, changes) : t)),
    );
  };

  /** Sends every changed rating and note; false (after a toast) if one was refused. */
  const saveChanges = async (assignmentId: string): Promise<boolean> => {
    for (const t of changedTasks) {
      const saved = savedById.get(t.id)!;
      const note = hasCompletion(t) ? changedNote(t) : undefined;
      const requests: Promise<Awaited<ReturnType<typeof saveTaskRating>>>[] =
        [];
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
        if (note !== undefined)
          requests.push(saveTaskRating(assignmentId, t.id, { remarks: note }));
      } else {
        const grade: { rating?: TaskRating | null; remarks?: string | null } =
          {};
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

  /**
   * Save the grade. The student sees each graded task at once; the scenario
   * becomes Completed when every row is graded, and until then this saves
   * progress and stays open. Saving an edit re-scores it.
   */
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
    if (result && !result.completed) {
      onAssignmentChange({ status: result.assignment.status });
      await reloadTasks();
      resetDraft();
      toast(
        `Progress saved — ${result.remaining} ${result.remaining === 1 ? "row" : "rows"} left. It completes once every row is graded.`,
      );
    } else if (result) {
      onAssignmentChange({
        status: "completed",
        score: result.score,
        completed_at: assignment.completed_at ?? new Date().toISOString(),
      });
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
      toast(
        "Couldn't check whether you may change this grade. Please try again.",
        "error",
      );
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

  // The checklist's column headers dock right under the pinned header above
  // them, so they need to know where that header ends once it is docked.
  const stickyHeadRef = useRef<HTMLDivElement>(null);
  const [stickyHeadBottom, setStickyHeadBottom] = useState(0);
  useEffect(() => {
    const el = stickyHeadRef.current;
    if (!el) return;
    const lg = window.matchMedia("(min-width: 1024px)");
    // Docked, the header sits one Shell padding (p-3 lg:p-5) above the
    // scroller's content edge — its -top inset.
    const measure = () => setStickyHeadBottom(el.offsetHeight - (lg.matches ? 20 : 12));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    lg.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      lg.removeEventListener("change", measure);
    };
  }, []);

  return (
    <>
      <div className="overflow-clip rounded-2xl border border-hairline bg-surface shadow-tile">
        {/* `overflow-clip`, not `-hidden`: it rounds off the square finalize
            bar at the panel's end without becoming a scroll container,
            which would pin that sticky bar to this box instead of the page. */}
        {/* The header and the grade bar stay pinned while the checklist
            scrolls under them. Like the finalize bar, the negative inset
            cancels Shell's padding (`p-3 lg:p-5`) so it docks at the
            window's top edge; keep the two in step. */}
        <div ref={stickyHeadRef} className="sticky -top-3 z-20 bg-surface lg:-top-5">
          {/* Who, what, and the grade so far */}
          <div
            {...(onCollapse &&
              collapseProps(onCollapse, `Collapse ${selected.scenario_title}`))}
            className={`flex flex-col gap-5 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
              onCollapse
                ? "cursor-pointer transition-colors hover:bg-subtle/60"
                : ""
            }`}
          >
            {header === "scenario" ? (
              // On the student's own profile, the scenario is what the sheet is about.
              <ScenarioInfo assignment={selected} />
            ) : (
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
                  <p className="text-sm text-gray-500">
                    {selected.scenario_title}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-600">
                    <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                      <FontAwesomeIcon
                        icon={faCalendarCheck}
                        className="h-3 w-3 text-gray-400"
                      />
                      {selected.submitted_at
                        ? `Submitted ${formatWhen(selected.submitted_at)}`
                        : "Not submitted yet"}
                    </span>
                    {Boolean(selected.time_taken) && (
                      <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 tabular-nums">
                        <FontAwesomeIcon
                          icon={faStopwatch}
                          className="h-3 w-3 text-gray-400"
                        />
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
            )}

            <div className="flex shrink-0 items-center gap-4">
              {tasksLoading ? (
                <div
                  className="flex shrink-0 animate-pulse items-center gap-4 sm:flex-row-reverse"
                  aria-hidden
                >
                  <div className="h-[84px] w-[84px] rounded-full border-[7px] border-gray-200" />
                  <div className="space-y-2 sm:flex sm:flex-col sm:items-end">
                    <div className="h-2.5 w-24 rounded bg-gray-200" />
                    <div className="h-6 w-36 rounded bg-gray-200" />
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-4 sm:flex-row-reverse sm:text-right">
                  <ScoreRing
                    value={gradePending ? null : shownScore}
                    final={finalized}
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {finalized ? "Final grade" : "Projected grade"}
                    </p>
                    <p className="font-display text-2xl font-bold tracking-tight text-gray-900">
                      {gradePending
                        ? ungraded
                          ? "Not graded yet"
                          : "—"
                        : scoreDescriptor(shownScore)}
                    </p>
                  </div>
                </div>
              )}
              {onCollapse && <Chevron open />}
            </div>
          </div>

          {tasksLoading && (
            <div
              className="animate-pulse border-b border-hairline px-5 py-4 sm:px-6"
              aria-hidden
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="h-2.5 w-40 rounded bg-gray-200" />
                <div className="h-2.5 w-24 rounded bg-gray-100" />
              </div>
              <div className="flex h-2.5 gap-0.5">
                {[3, 2, 4].map((grow, i) => (
                  <span
                    key={i}
                    style={{ flexGrow: grow }}
                    className="basis-0 rounded-full bg-gray-200"
                  />
                ))}
              </div>
            </div>
          )}

          {/* How the grade is composed: one segment per task, as wide as its weight */}
          {!tasksLoading && tasks.length > 0 && (
            <div className="border-b border-hairline px-5 py-4 sm:px-6">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-gray-700">
                  {finalized
                    ? "Grade breakdown"
                    : `${ratedCount} of ${rows.length} checklist rows rated`}
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
        </div>

        {!ratingsEnabled && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <p>
              Ratings can&apos;t be saved yet — database migration 043 (scenario
              task ratings) hasn&apos;t been applied. Existing check-offs still
              count at full credit.
            </p>
          </div>
        )}
        {ratingsEnabled && !stepsEnabled && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <p>
              Sub-task checklists appear once database migration 044 (scenario
              task steps) is applied. Until then each task is rated as a whole.
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
          stickyTop={stickyHeadBottom}
          onRateTask={handleRateTask}
          onRateSteps={handleRateSteps}
          noteDrafts={noteDrafts}
          openNotes={openNotes}
          onOpenNote={(taskId) =>
            setOpenNotes((open) => new Set(open).add(taskId))
          }
          onNoteChange={(taskId, value) =>
            setNoteDrafts((d) => ({ ...d, [taskId]: value }))
          }
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
            {tasksLoading ? (
              <div className="animate-pulse space-y-2 py-0.5" aria-hidden>
                <div className="h-3.5 w-48 rounded bg-gray-200" />
                <div className="h-2.5 w-64 rounded bg-gray-100" />
              </div>
            ) : locked ? (
              <>
                <p className="text-gray-600">
                  Saved as{" "}
                  <span className="font-semibold text-gray-900">
                    {scoreDescriptor(shownScore)}
                  </span>{" "}
                  ({shownScore}%)
                  {selected.completed_at
                    ? ` on ${formatDay(selected.completed_at)}`
                    : ""}
                  .
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
                    {ungraded
                      ? "not graded yet"
                      : `${scoreDescriptor(projectedScore)} · ${projectedScore}%`}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {dirty && (
                    <span className="font-medium text-amber-600">
                      Unsaved changes on {changedTasks.length}{" "}
                      {changedTasks.length === 1 ? "task" : "tasks"} ·{" "}
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
            {tasksLoading ? (
              <div
                className="h-10 w-24 animate-pulse rounded-xl bg-gray-200"
                aria-hidden
              />
            ) : locked ? (
              <button
                onClick={handleEdit}
                disabled={editState?.status === "pending"}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-600 bg-surface px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-tile transition-all hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-500 disabled:hover:bg-surface"
              >
                <FontAwesomeIcon
                  icon={
                    editState?.status === "pending"
                      ? faHourglassHalf
                      : faPenToSquare
                  }
                  className="h-3.5 w-3.5"
                />
                {editState?.status === "pending"
                  ? "Awaiting approval"
                  : editState?.status === "accepted" ||
                      editState?.status === "not_required"
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
                    <FontAwesomeIcon
                      icon={faRotateLeft}
                      className="h-3.5 w-3.5"
                    />
                    {finalized ? "Cancel" : "Discard"}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={
                    finalizing || tasksLoading || tasks.length === 0 || ungraded
                  }
                  title={ungraded ? "Rate at least one row first" : undefined}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-tile transition-all hover:bg-brand-700 hover:shadow-tile-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-600"
                >
                  {finalizing ? (
                    <EcgLoader />
                  ) : (
                    <FontAwesomeIcon
                      icon={faFloppyDisk}
                      className="h-3.5 w-3.5"
                    />
                  )}
                  {finalizing
                    ? "Saving…"
                    : finalized
                      ? "Save"
                      : unratedMissing > 0
                        ? "Save progress"
                        : "Save & finish"}
                </button>
              </>
            )}
          </div>
        </div>
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
    </>
  );
}
