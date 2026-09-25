"use client";

import type { KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCheckDouble,
  faCommentMedical,
  faHandHoldingMedical,
  faLaptopMedical,
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

/** Points can be halves (Satisfactory is 7.5): "7.5", "22.5", "30". */
export const formatPoints = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
  /** Rows (sub-task or task ids) with a save in flight. */
  savingKeys: ReadonlySet<string>;
  onRateTask: (task: GradingTask, rating: TaskRating | null) => void;
  onRateSteps: (task: GradingTask, changes: Map<string, TaskRating | null>) => void;
  noteDrafts: Record<string, string>;
  openNotes: ReadonlySet<string>;
  onOpenNote: (taskId: string) => void;
  onNoteChange: (taskId: string, value: string) => void;
  onNoteBlur: (task: GradingTask) => void;
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
  savingKeys,
  onRateTask,
  onRateSteps,
  noteDrafts,
  openNotes,
  onOpenNote,
  onNoteChange,
  onNoteBlur,
}: GradingTableProps) {
  if (loading) {
    return (
      <div className="space-y-2 p-5 sm:p-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl border border-hairline bg-subtle" />
        ))}
      </div>
    );
  }
  if (tasks.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">This scenario has no criteria.</p>;
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full min-w-[600px] border-collapse text-sm">
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
          <thead>
            <tr className="border-b border-hairline bg-subtle">
              <th
                scope="col"
                className="sticky left-0 z-[1] bg-subtle px-4 py-3 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500"
              >
                Task / sub-task
              </th>
              {TASK_RATINGS.map((level) => (
                <th key={level.key} scope="col" title={rubric[level.key]} className="cursor-help px-0.5 py-3 align-bottom">
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
                className="py-3 pl-1 pr-4 text-right align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500"
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
              savingKeys={savingKeys}
              onRateTask={onRateTask}
              onRateSteps={onRateSteps}
              noteOpen={openNotes.has(task.id) || Boolean(task.remarks)}
              noteAutoFocus={openNotes.has(task.id) && !task.remarks}
              noteValue={noteDrafts[task.id] ?? task.remarks ?? ""}
              onOpenNote={onOpenNote}
              onNoteChange={onNoteChange}
              onNoteBlur={onNoteBlur}
            />
          ))}
        </table>
      </div>

      {/* The rubric: what each column means for this scenario. */}
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
  savingKeys: ReadonlySet<string>;
  onRateTask: (task: GradingTask, rating: TaskRating | null) => void;
  onRateSteps: (task: GradingTask, changes: Map<string, TaskRating | null>) => void;
  noteOpen: boolean;
  noteAutoFocus: boolean;
  noteValue: string;
  onOpenNote: (taskId: string) => void;
  onNoteChange: (taskId: string, value: string) => void;
  onNoteBlur: (task: GradingTask) => void;
}

function TaskGroup({
  task,
  index,
  totalPoints,
  readOnly,
  savingKeys,
  onRateTask,
  onRateSteps,
  noteOpen,
  noteAutoFocus,
  noteValue,
  onOpenNote,
  onNoteChange,
  onNoteBlur,
}: TaskGroupProps) {
  const rows = checklistRows(task);
  const hasSteps = task.steps.length > 0;
  const isAuto = task.verification === "system";
  const { earned, max } = taskPoints(task);
  const weight = totalPoints > 0 ? Math.round((task.points / totalPoints) * 100) : 0;
  const trigger = task.system_trigger === "vitals" ? "recording vitals" : "charting";

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
          className={`sticky left-0 z-[1] px-4 py-3.5 text-left align-top font-normal ${hasSteps ? "bg-subtle" : "bg-surface"}`}
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
                  <FontAwesomeIcon icon={isAuto ? faLaptopMedical : faHandHoldingMedical} className="h-2.5 w-2.5" />
                  {isAuto ? "Auto-tracked" : "Hands-on"}
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
              {isAuto && (
                <p className="mt-1 text-xs text-gray-400">
                  {task.completed_via === "system"
                    ? `Auto-completed from the student's ${trigger}${task.completed_at ? ` · ${formatWhen(task.completed_at)}` : ""}`
                    : `Not detected — completes from the student's ${trigger}`}
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
            <td key={option.key} className="px-0.5 py-3.5 text-center align-top">
              {openRows.length > 0 && !readOnly && (
                <button
                  onClick={() => fillOpenRows(option.key)}
                  disabled={openRows.some((r) => savingKeys.has(r.key))}
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
              saving={savingKeys.has(rows[0].key)}
              onRate={rateRow}
            />
          ),
        )}

        <td className="py-3.5 pl-1 pr-4 text-right align-top">
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
                  saving={savingKeys.has(row.key)}
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
              onBlur={() => onNoteBlur(task)}
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
  saving: boolean;
  onRate: (row: ChecklistRow, option: TaskRating) => void;
}

function RatingCell({ row, option, label, readOnly, saving, onRate }: RatingCellProps) {
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
        disabled={saving || readOnly}
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
        className={`group mx-auto grid h-7 w-7 place-items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-wait ${readOnly ? "disabled:cursor-default" : ""} ${
          saving ? "opacity-60" : ""
        } ${checked ? style.checked : shown ? style.implied : `border-gray-300 bg-surface text-transparent ${readOnly ? "" : style.hover}`}`}
      >
        <FontAwesomeIcon icon={faCheck} className={`h-3 w-3 ${shown ? "" : "opacity-70"}`} />
      </button>
    </td>
  );
}

