import type { GradingTask } from "../../../lib/api";
import {
  MAX_RATING_POINTS,
  ratingForCredit,
  ratingPoints,
  resolveStepRatings,
  taskCredit,
  wholeTaskLevel,
  type StepGrades,
  type TaskRating,
} from "../../../lib/task-ratings";

/**
 * Color is reserved for the grade: each level keeps one hue from its column
 * header to its checkmarks and its segment in the composition bar. Fills use
 * the 600 ramp with `text-surface` ink, which the dark theme lifts and inverts
 * together; tints use 50/100, which it remaps. So every pairing reads in both.
 */
export const RATING_STYLE: Record<
  TaskRating,
  { dot: string; checked: string; implied: string; hover: string; count: string }
> = {
  excellent: {
    dot: "bg-emerald-500",
    checked: "border-emerald-600 bg-emerald-600 text-surface",
    implied: "border-dashed border-emerald-600 text-emerald-600",
    hover: "hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-600",
    count: "bg-emerald-100 text-emerald-800",
  },
  satisfactory: {
    dot: "bg-blue-500",
    checked: "border-blue-600 bg-blue-600 text-surface",
    implied: "border-dashed border-blue-600 text-blue-600",
    hover: "hover:border-blue-600 hover:bg-blue-50 hover:text-blue-600",
    count: "bg-blue-100 text-blue-800",
  },
  needs_practice: {
    dot: "bg-amber-500",
    checked: "border-amber-600 bg-amber-600 text-surface",
    implied: "border-dashed border-amber-600 text-amber-600",
    hover: "hover:border-amber-600 hover:bg-amber-50 hover:text-amber-600",
    count: "bg-amber-100 text-amber-800",
  },
};

/** A completion row exists — done by the student's charting, or rated by faculty. */
export const hasCompletion = (t: GradingTask) => t.completed_via !== null;

/** What the task scores as a whole while none of its sub-tasks is rated. */
const wholeLevel = (t: GradingTask) => (hasCompletion(t) ? wholeTaskLevel({ rating: t.rating }) : null);

/** One gradable row of the sheet: a sub-task, or a task that has none. */
export interface ChecklistRow {
  key: string;
  /** Null when the row is the task itself. */
  stepId: string | null;
  /** The level the row scores at right now; null earns nothing. */
  level: TaskRating | null;
  /**
   * True when `level` isn't a rating anyone gave this row but the level its
   * task counts at as a whole — an auto-completion, or a whole-task rating
   * from before the task had sub-tasks. It holds until the row is rated.
   */
  implied: boolean;
}

export function checklistRows(t: GradingTask): ChecklistRow[] {
  if (t.steps.length === 0) {
    return [{ key: t.id, stepId: null, level: t.rating ?? wholeLevel(t), implied: t.rating === null && hasCompletion(t) }];
  }
  const anyRated = t.steps.some((s) => s.rating !== null);
  const implied = anyRated ? null : wholeLevel(t);
  return t.steps.map((s) => ({
    key: s.id,
    stepId: s.id,
    level: anyRated ? s.rating : implied,
    implied: !anyRated && implied !== null,
  }));
}

/** The task's checklist points: each row scores its level's points out of MAX_RATING_POINTS. */
export function taskPoints(t: GradingTask): { earned: number; max: number } {
  const rows = checklistRows(t);
  return {
    earned: rows.reduce((sum, r) => sum + (r.level ? ratingPoints(r.level) : 0), 0),
    max: rows.length * MAX_RATING_POINTS,
  };
}

/** The single level the task reads at now, for its segment of the composition bar. */
export function taskLevel(t: GradingTask): { level: TaskRating | null; implied: boolean } {
  const rows = checklistRows(t);
  if (rows.length === 1 || rows.every((r) => r.implied || r.level === null)) {
    return { level: rows[0].level, implied: rows[0].implied };
  }
  return { level: ratingForCredit(taskCredit(undefined, stepGrades(t))), implied: false };
}

export function stepGrades(t: GradingTask): StepGrades {
  return {
    total: t.steps.length,
    ratings: t.steps.flatMap((s) => (s.rating ? [s.rating] : [])),
  };
}

/** The task as it reads after the server applies a whole-task `rating` (see the PUT route). */
export function withRating(t: GradingTask, rating: TaskRating | null): GradingTask {
  if (rating === null) {
    if (t.completed_via === "faculty") {
      return { ...t, rating: null, remarks: null, is_completed: false, completed_via: null, completed_at: null };
    }
    return { ...t, rating: null, is_completed: hasCompletion(t) };
  }
  return {
    ...t,
    rating,
    is_completed: true,
    completed_via: t.completed_via ?? "faculty",
    completed_at: t.completed_at ?? new Date().toISOString(),
  };
}

/**
 * The task as it reads after the server applies sub-task `changes` (step id →
 * level, or null to clear): the same resolveStepRatings the route runs, then
 * the overall level it stores on the completion row.
 */
export function withStepChanges(t: GradingTask, changes: ReadonlyMap<string, TaskRating | null>): GradingTask {
  const current = new Map(t.steps.flatMap((s) => (s.rating ? [[s.id, s.rating] as const] : [])));
  const final = resolveStepRatings(
    t.steps.map((s) => s.id),
    current,
    wholeLevel(t),
    changes,
  );
  const steps = t.steps.map((s, i) => ({ ...s, rating: final[i] }));
  const rated = final.filter((level): level is TaskRating => level !== null);
  if (rated.length === 0) return withRating({ ...t, steps }, null);
  return withRating({ ...t, steps }, ratingForCredit(taskCredit(undefined, { total: steps.length, ratings: rated })));
}
