"use client";

import { DEFAULT_RUBRIC, MAX_RUBRIC_LENGTH, TASK_RATINGS, type Rubric } from "../../lib/task-ratings";

const DOT: Record<keyof Rubric, string> = {
  excellent: "bg-emerald-500",
  satisfactory: "bg-blue-500",
  needs_practice: "bg-amber-500",
};

/**
 * What each grading level means on this scenario. Starts from the Taylor's
 * checklist definitions; a level left as the default is stored as nothing, so
 * it follows the book if the defaults are ever reworded.
 */
export default function RubricEditor({
  value,
  onChange,
}: {
  value: Rubric;
  onChange: (next: Rubric) => void;
}) {
  const customised = TASK_RATINGS.some((l) => value[l.key].trim() !== DEFAULT_RUBRIC[l.key]);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-800">Grading rubric</p>
          <p className="mt-0.5 text-xs text-gray-500">
            What each checklist level means on this scenario. Faculty see it while grading.
          </p>
        </div>
        {customised && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_RUBRIC })}
            className="shrink-0 text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            Reset to Taylor&apos;s defaults
          </button>
        )}
      </div>
      <div className="space-y-3">
        {TASK_RATINGS.map((level) => (
          <div key={level.key}>
            <label htmlFor={`rubric-${level.key}`} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <span className={`h-2 w-2 rounded-full ${DOT[level.key]}`} aria-hidden />
              {level.label}
              <span className="font-medium tabular-nums text-gray-400">· {level.points} pts per step</span>
            </label>
            <textarea
              id={`rubric-${level.key}`}
              value={value[level.key]}
              onChange={(e) => onChange({ ...value, [level.key]: e.target.value })}
              maxLength={MAX_RUBRIC_LENGTH}
              rows={2}
              className="w-full resize-y rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The rubric to store: only the levels that differ from the defaults, or null. */
export function rubricToStore(value: Rubric): Partial<Rubric> | null {
  const own: Partial<Rubric> = {};
  for (const l of TASK_RATINGS) {
    const text = value[l.key].trim();
    if (text && text !== DEFAULT_RUBRIC[l.key]) own[l.key] = text;
  }
  return Object.keys(own).length > 0 ? own : null;
}
