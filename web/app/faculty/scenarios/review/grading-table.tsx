"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCheckDouble,
  faCommentMedical,
  faHandHoldingMedical,
} from "@fortawesome/free-solid-svg-icons";
import type { GradingTask } from "../../../lib/api";
import {
  MAX_RATING_POINTS,
  MAX_REMARKS_LENGTH,
  TASK_RATINGS,
  ratingLabel,
  ratingPoints,
  type Rubric,
  type TaskRating,
} from "../../../lib/task-ratings";
import { RATING_STYLE, checklistRows, hasCompletion, taskPoints, type ChecklistRow } from "./grading";

const COLUMN_COUNT = TASK_RATINGS.length + 2;

/** Whole points today (3 / 2 / 1), but a total could still come out fractional: "7", "7.5". */
export const formatPoints = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The checklist's shape while it loads: the column header, then a task row
 * over a few sub-task rows, each with its three empty checkmarks.
 */
function GradingTableSkeleton() {
  const circles = (
    <>
      {TASK_RATINGS.map((level) => (
        <div key={level.key} className="flex w-[92px] shrink-0 justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-gray-200" />
        </div>
      ))}
      <div className="flex w-[64px] shrink-0 justify-end pr-4">
        <div className="h-2.5 w-6 rounded bg-gray-100" />
      </div>
    </>
  );
  return (
    <div className="p-5 sm:p-6" aria-busy="true" aria-label="Loading the checklist">
      <div className="animate-pulse overflow-hidden rounded-xl border border-hairline">
        <div className="flex items-end border-b border-hairline bg-subtle py-3">
          <div className="flex-1 px-4">
            <div className="h-2.5 w-24 rounded bg-gray-200" />
          </div>
          {TASK_RATINGS.map((level) => (
            <div key={level.key} className="flex w-[92px] shrink-0 flex-col items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-gray-300" />
              <div className="h-2 w-14 rounded bg-gray-200" />
              <div className="h-2 w-8 rounded bg-gray-100" />
            </div>
          ))}
          <div className="flex w-[64px] shrink-0 justify-end pr-4">
            <div className="h-2.5 w-10 rounded bg-gray-200" />
          </div>
        </div>
        {[0, 1].map((task) => (
          <div key={task}>
            <div className="flex items-start border-b border-hairline bg-subtle/60 py-4">
              <div className="flex-1 space-y-2 px-4">
                <div className="h-3.5 w-2/5 rounded bg-gray-200" />
                <div className="flex gap-1.5">
                  <div className="h-4 w-16 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
                <div className="h-2.5 w-3/4 rounded bg-gray-100" />
              </div>
              {circles}
            </div>
            {[0, 1, 2].map((step) => (
              <div key={step} className="flex items-center border-b border-hairline py-3 last:border-b-0">
                <div className="flex-1 space-y-1.5 pl-10 pr-4">
                  <div className={`h-3 rounded bg-gray-200 ${step === 1 ? "w-3/5" : "w-4/5"}`} />
                  <div className="h-2 w-24 rounded bg-gray-100" />
                </div>
                {circles}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** a, b, c … z, aa, ab … for sub-task rows. */
const rowLetter = (i: number): string =>
  (i >= 26 ? rowLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(97 + (i % 26));

/** Left/Right (and Home/End) move between a row's checkmarks, like a radio group. */
function moveWithinRow(e: KeyboardEvent<HTMLButtonElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const cells = Array.from(
    e.currentTarget.closest("tr")?.querySelectorAll<HTMLButtonElement>("button[data-rating-cell]") ?? [],
  );
  const at = cells.indexOf(e.currentTarget);
  if (at < 0) return;
  e.preventDefault();
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? cells.length - 1
        : (at + (e.key === "ArrowRight" ? 1 : -1) + cells.length) % cells.length;
  cells[next]?.focus();
}

interface GradingTableProps {
  tasks: GradingTask[];
  loading: boolean;
  totalPoints: number;
  /** What each level means for this scenario, shown on the column headers. */
  rubric: Rubric;
  /** A saved grade not being edited: shown, but nothing can be changed. */
  readOnly?: boolean;
  /** Where the column headers dock while the checklist scrolls under them. */
  stickyTop?: number;
  onRateTask: (task: GradingTask, rating: TaskRating | null) => void;
  onRateSteps: (task: GradingTask, changes: Map<string, TaskRating | null>) => void;
  noteDrafts: Record<string, string>;
  openNotes: ReadonlySet<string>;
  onOpenNote: (taskId: string) => void;
  onNoteChange: (taskId: string, value: string) => void;
}

/**
 * The grading sheet, laid out like a Taylor's skill checklist: one row per
 * sub-task under each task, one checkmark column per level, and the points
 * each row earns. A task without sub-tasks is a single checkable row.
 */
export default function GradingTable({
  tasks,
  loading,
  totalPoints,
  rubric,
  readOnly = false,
  onRateTask,
  onRateSteps,
  noteDrafts,
  openNotes,
  onOpenNote,
  onNoteChange,
  stickyTop = 0,
}: GradingTableProps) {
  // A task's heading row docks under the column headers, so it needs their height.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [theadHeight, setTheadHeight] = useState(0);
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const measure = () => setTheadHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, tasks.length]);

  // Only the task being read pins its heading. Table cells all stick against
  // the whole table, so pinning every heading would leave a taller earlier
  // one showing under a shorter later one. The task being read is the last
  // one whose body has reached the column headers' lower edge; none while the
  // next task's heading is on its way up to take its place.
  const tableRef = useRef<HTMLTableElement>(null);
  const [activeTask, setActiveTask] = useState(0);
  useEffect(() => {
    const table = tableRef.current;
    const thead = theadRef.current;
    if (!table || !thead) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // The header cells are what stick (the <thead> box itself scrolls away).
      const line = (thead.querySelector("th") ?? thead).getBoundingClientRect().bottom + 1;
      const bodies = Array.from(table.querySelectorAll<HTMLTableSectionElement>(":scope > tbody"));
      let active = 0;
      bodies.forEach((b, i) => {
        if (b.getBoundingClientRect().top <= line) active = i;
      });
      // Let go once the next task reaches the pinned heading's lower edge, so
      // the next heading rises into view instead of sliding under this one.
      const next = bodies[active + 1];
      const headingHeight = bodies[active]?.rows[0]?.getBoundingClientRect().height ?? 0;
      if (next && next.getBoundingClientRect().top <= line + headingHeight) active = -1;
      setActiveTask(active);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // Capture: the page scrolls inside Shell's container, not the window.
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [loading, tasks.length]);

  // Every header cell sticks (a <tr> can't), on an opaque background with a
  // shadow for the rule border-collapse drops from sticky cells.
  const headCell = "sticky z-[2] bg-subtle shadow-[inset_0_-1px_0_var(--color-hairline,rgba(0,0,0,0.08))]";
  if (loading) return <GradingTableSkeleton />;
  if (tasks.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">This patient case has no criteria.</p>;
  }

  return (
    <div className="p-5 sm:p-6">
      {/* Scrolls sideways on narrow screens; on wide ones it isn't a scroll
          container, so the column headers can stick to the page. */}
      <div className="overflow-x-auto rounded-xl border border-hairline lg:overflow-visible">
        <table ref={tableRef} className="w-full min-w-[600px] border-collapse text-sm">
          <caption className="sr-only">
            Grading checklist: rate each task&apos;s sub-tasks Excellent ({MAX_RATING_POINTS} points), Satisfactory,
            or Needs Practice. An unrated sub-task earns no points.
          </caption>
          <colgroup>
            <col />
            {TASK_RATINGS.map((level) => (
              <col key={level.key} className="w-[92px]" />
            ))}
            <col className="w-[64px]" />
          </colgroup>
          <thead ref={theadRef}>
            <tr className="border-b border-hairline bg-subtle">
              <th
                scope="col"
                style={{ top: stickyTop }}
                className={`${headCell} left-0 z-[3] px-4 py-3 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500`}
              >
                Task / sub-task
              </th>
              {TASK_RATINGS.map((level) => (
                <th
                  key={level.key}
                  scope="col"
                  title={rubric[level.key]}
                  style={{ top: stickyTop }}
                  className={`${headCell} cursor-help px-0.5 py-3 align-bottom`}
                >
                  <span className="flex flex-col items-center gap-1 text-center">
                    <span className={`h-2 w-2 rounded-full ${RATING_STYLE[level.key].dot}`} aria-hidden />
                    <span className="text-[10.5px] font-semibold leading-tight text-gray-700">{level.label}</span>
                    <span className="text-[10px] font-medium tabular-nums text-gray-400">
                      {formatPoints(level.points)} pts
                    </span>
                  </span>
                </th>
              ))}
              <th
                scope="col"
                style={{ top: stickyTop }}
                className={`${headCell} py-3 pl-1 pr-4 text-right align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500`}
              >
                Points
              </th>
            </tr>
          </thead>

          {tasks.map((task, i) => (
            <TaskGroup
              key={task.id}
              task={task}
              index={i}
              totalPoints={totalPoints}
              readOnly={readOnly}
              onRateTask={onRateTask}
              onRateSteps={onRateSteps}
              noteOpen={openNotes.has(task.id) || Boolean(task.remarks)}
              noteAutoFocus={openNotes.has(task.id) && !task.remarks}
              noteValue={noteDrafts[task.id] ?? task.remarks ?? ""}
              stickyTop={stickyTop + theadHeight}
              pinned={i === activeTask}
              onOpenNote={onOpenNote}
              onNoteChange={onNoteChange}
            />
          ))}
        </table>
      </div>

      {/* The rubric: what each column means for this patient case. */}
      <dl className="mt-3 grid gap-2 rounded-xl border border-hairline bg-subtle p-3 sm:grid-cols-3">
        {TASK_RATINGS.map((level) => (
          <div key={level.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
              <span className={`h-2 w-2 rounded-full ${RATING_STYLE[level.key].dot}`} aria-hidden />
              {level.label}
              <span className="font-medium tabular-nums text-gray-400">· {formatPoints(level.points)} pts</span>
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-gray-500">{rubric[level.key]}</dd>
          </div>
        ))}
      </dl>

      {/* Key to the two checkmark styles. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className={`grid h-4 w-4 place-items-center rounded-full border ${RATING_STYLE.excellent.checked}`}>
            <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />
          </span>
          Rated
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`grid h-4 w-4 place-items-center rounded-full border ${RATING_STYLE.excellent.implied}`}>
            <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />
          </span>
          Counts until you rate it
        </span>
        {!readOnly && <span>Click a checked box again to clear it.</span>}
      </div>
    </div>
  );
}

interface TaskGroupProps {
  task: GradingTask;
  index: number;
  totalPoints: number;
  readOnly: boolean;
  onRateTask: (task: GradingTask, rating: TaskRating | null) => void;
  onRateSteps: (task: GradingTask, changes: Map<string, TaskRating | null>) => void;
  noteOpen: boolean;
  noteAutoFocus: boolean;
  noteValue: string;
  onOpenNote: (taskId: string) => void;
  onNoteChange: (taskId: string, value: string) => void;
  /** Where a task's heading row docks while its sub-tasks scroll under it. */
  stickyTop: number;
  /** Whether this is the task being read, the one whose heading stays in view. */
  pinned: boolean;
}

function TaskGroup({
  task,
  index,
  totalPoints,
  readOnly,
  onRateTask,
  onRateSteps,
  noteOpen,
  noteAutoFocus,
  noteValue,
  onOpenNote,
  onNoteChange,
  stickyTop,
  pinned,
}: TaskGroupProps) {
  const rows = checklistRows(task);
  const hasSteps = task.steps.length > 0;
  // A task with sub-tasks keeps its heading row in view while they scroll
  // under it; the next task's heading takes its place.
  const pin = hasSteps && pinned;
  const taskHead = `bg-subtle ${pin ? "sticky shadow-[inset_0_-1px_0_var(--color-hairline)]" : ""}`;
  const { earned, max } = taskPoints(task);
  const weight = totalPoints > 0 ? Math.round((task.points / totalPoints) * 100) : 0;

  // Rows nobody has rated yet — the ones a header checkmark fills in.
  const openRows = rows.filter((r) => r.implied || r.level === null);
  const unscored = rows.filter((r) => r.level === null).length;
  const impliedLevel = rows.find((r) => r.implied)?.level ?? null;

  const status = impliedLevel
    ? `Unrated ${hasSteps ? "rows count" : "— counts"} as ${ratingLabel(impliedLevel)} until you rate ${hasSteps ? "them" : "it"}`
    : unscored === rows.length
      ? "Not rated — earns no points yet"
      : unscored > 0
        ? `${unscored} unrated ${unscored === 1 ? "row earns" : "rows earn"} no points`
        : null;

  const rateRow = (row: ChecklistRow, option: TaskRating) => {
    const next = row.level === option && !row.implied ? null : option;
    if (row.stepId === null) onRateTask(task, next);
    else onRateSteps(task, new Map([[row.stepId, next]]));
  };

  const fillOpenRows = (option: TaskRating) =>
    onRateSteps(task, new Map(openRows.map((r) => [r.stepId!, option])));

  return (
    <tbody
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className="animate-rise border-t border-hairline first-of-type:border-t-0"
    >
      {/* The task: a heading row over its sub-tasks, or the checkable row itself */}
      <tr className={`group/task ${hasSteps ? "bg-subtle" : ""}`}>
        <th
          scope="rowgroup"
          style={pin ? { top: stickyTop } : undefined}
          className={`sticky left-0 px-4 py-3.5 text-left align-top font-normal ${hasSteps ? `z-[2] ${taskHead}` : "z-[1] bg-surface"}`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 font-mono text-xs font-medium tabular-nums text-gray-400">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug text-gray-900">{task.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
                  {task.category}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  <FontAwesomeIcon icon={faHandHoldingMedical} className="h-2.5 w-2.5" />
                  Hands-on
                </span>
                <span
                  title={`${task.points} of ${totalPoints} points`}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-600"
                >
                  {weight}% of grade
                </span>
              </div>
              {task.description && (
                <p className={`mt-1.5 text-xs text-gray-500 ${hasSteps ? "line-clamp-2" : ""}`} title={task.description}>
                  {task.description}
                </p>
              )}
              {/* Before migration 057 charting on the ward ticked some tasks by itself;
                  those completions stay, and are marked as such. */}
              {task.completed_via === "system" && (
                <p className="mt-1 text-xs text-gray-400">
                  Checked off by the student&apos;s ward charting
                  {task.completed_at ? ` · ${formatWhen(task.completed_at)}` : ""}
                </p>
              )}
              {status && <p className="mt-1 text-xs text-gray-400">{status}</p>}
              {hasCompletion(task) && !noteOpen && !readOnly && (
                <button
                  onClick={() => onOpenNote(task.id)}
                  className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <FontAwesomeIcon icon={faCommentMedical} className="h-3 w-3" />
                  Add note
                </button>
              )}
            </div>
          </div>
        </th>

        {TASK_RATINGS.map((option) =>
          hasSteps ? (
            <td
              key={option.key}
              style={pin ? { top: stickyTop } : undefined}
              className={`${taskHead} z-[1] px-0.5 py-3.5 text-center align-top`}
            >
              {openRows.length > 0 && !readOnly && (
                <button
                  onClick={() => fillOpenRows(option.key)}
                  title={`Rate the ${openRows.length} unrated sub-task${openRows.length === 1 ? "" : "s"} ${option.label}`}
                  aria-label={`Rate the ${openRows.length} unrated sub-tasks of ${task.title} ${option.label}`}
                  className={`mx-auto grid h-6 w-6 place-items-center rounded-md border border-dashed border-gray-300 text-transparent opacity-40 transition-all group-hover/task:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:opacity-30 ${RATING_STYLE[option.key].hover}`}
                >
                  <FontAwesomeIcon icon={faCheckDouble} className="h-2.5 w-2.5" />
                </button>
              )}
            </td>
          ) : (
            <RatingCell
              key={option.key}
              row={rows[0]}
              option={option.key}
              label={task.title}
              readOnly={readOnly}
              onRate={rateRow}
            />
          ),
        )}

        <td
          style={pin ? { top: stickyTop } : undefined}
          className={`py-3.5 pl-1 pr-4 text-right align-top ${hasSteps ? `${taskHead} z-[1]` : ""}`}
        >
          <span
            className={`block font-display text-base font-bold tabular-nums ${
              rows.every((r) => r.level === null) ? "text-gray-300" : rows.some((r) => r.implied) ? "text-gray-400" : "text-gray-800"
            }`}
          >
            {formatPoints(earned)}
            <span className="text-xs font-semibold text-gray-400">/{formatPoints(max)}</span>
          </span>
          <span className="text-[11px] tabular-nums text-gray-400">{max > 0 ? Math.round((earned / max) * 100) : 0}%</span>
        </td>
      </tr>

      {/* Sub-tasks */}
      {hasSteps &&
        task.steps.map((step, i) => {
          const row = rows[i];
          return (
            <tr key={step.id} className="border-t border-hairline/70">
              <th scope="row" className="sticky left-0 z-[1] bg-surface py-2.5 pl-4 pr-4 text-left align-top font-normal">
                <div className="flex items-start gap-2.5 pl-5">
                  <span className="mt-px w-4 shrink-0 font-mono text-xs text-gray-400">{rowLetter(i)}.</span>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug text-gray-800">{step.title}</p>
                    {step.source && <p className="mt-0.5 text-[11px] text-gray-400">Taylor&apos;s {step.source}</p>}
                  </div>
                </div>
              </th>
              {TASK_RATINGS.map((option) => (
                <RatingCell
                  key={option.key}
                  row={row}
                  option={option.key}
                  label={step.title}
                  readOnly={readOnly}
                  onRate={rateRow}
                />
              ))}
              <td className="py-2.5 pl-1 pr-4 text-right align-top">
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    row.level === null ? "text-gray-300" : row.implied ? "text-gray-400" : "text-gray-800"
                  }`}
                >
                  {row.level === null ? "—" : formatPoints(ratingPoints(row.level))}
                </span>
              </td>
            </tr>
          );
        })}

      {/* Note */}
      {noteOpen && hasCompletion(task) && (
        <tr className="border-t border-hairline/70">
          <td colSpan={COLUMN_COUNT} className="px-4 pb-3.5 pt-2.5">
            <textarea
              value={noteValue}
              autoFocus={noteAutoFocus}
              onChange={(e) => onNoteChange(task.id, e.target.value)}
              readOnly={readOnly}
              maxLength={MAX_REMARKS_LENGTH}
              rows={2}
              placeholder="What went well, and what to work on…"
              aria-label={`Note for ${task.title}`}
              className="w-full resize-y rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
            />
          </td>
        </tr>
      )}
    </tbody>
  );
}

interface RatingCellProps {
  row: ChecklistRow;
  option: TaskRating;
  /** The row's title, for the checkmark's accessible name. */
  label: string;
  readOnly: boolean;
  onRate: (row: ChecklistRow, option: TaskRating) => void;
}

function RatingCell({ row, option, label, readOnly, onRate }: RatingCellProps) {
  const style = RATING_STYLE[option];
  const shown = row.level === option;
  const checked = shown && !row.implied;
  // Roving focus: Tab lands on the row's mark (or its first cell), arrows move within it.
  const tabbable = row.level === null ? option === TASK_RATINGS[0].key : shown;
  const points = ratingPoints(option);

  return (
    <td className="px-0.5 py-2.5 text-center align-top">
      <button
        data-rating-cell
        role="radio"
        aria-checked={checked}
        aria-label={`${label}: ${ratingLabel(option)}, ${formatPoints(points)} points${
          shown && row.implied ? " (counts until rated)" : ""
        }`}
        tabIndex={tabbable ? 0 : -1}
        disabled={readOnly}
        onClick={() => onRate(row, option)}
        onKeyDown={moveWithinRow}
        title={
          readOnly
            ? `${ratingLabel(option)} — ${formatPoints(points)} points`
            : checked
            ? "Click again to clear"
            : shown
              ? `Counts as ${ratingLabel(option)} until rated — click to confirm`
              : `${ratingLabel(option)} — ${formatPoints(points)} points`
        }
        className={`group mx-auto grid h-7 w-7 place-items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-default ${checked ? style.checked : shown ? style.implied : `border-gray-300 bg-surface text-transparent ${readOnly ? "" : style.hover}`}`}
      >
        <FontAwesomeIcon icon={faCheck} className={`h-3 w-3 ${shown ? "" : "opacity-70"}`} />
      </button>
    </td>
  );
}

