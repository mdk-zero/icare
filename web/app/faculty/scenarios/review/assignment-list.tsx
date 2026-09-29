"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import type { ScenarioAssignment } from "../../../lib/api";
import { scoreDescriptor } from "../../../lib/task-ratings";

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * A scenario is either Assigned (the student is working on it, or has
 * submitted it and it waits for your grade) or Completed (graded and locked).
 */
export type Filter = "assigned" | "completed" | "all";

const FILTERS: { key: Filter; label: string; title: string }[] = [
  {
    key: "assigned",
    label: "Assigned",
    title: "Not graded yet, submitted or not",
  },
  { key: "completed", label: "Completed", title: "Graded and locked" },
  { key: "all", label: "All", title: "Every patient case" },
];

/** Submitted and waiting for a grade — still Assigned, but the ones to grade first. */
export function isSubmitted(a: ScenarioAssignment) {
  return Boolean(a.submitted_at) && a.status !== "completed";
}

export function matchesFilter(a: ScenarioAssignment, filter: Filter) {
  if (filter === "assigned") return a.status !== "completed";
  if (filter === "completed") return a.status === "completed";
  return true;
}

export function EmptyPanel({
  icon,
  title,
  body,
}: {
  icon: typeof faCheck;
  title: string;
  body: string;
}) {
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

/** Stand-ins shaped like the scenario cards: a title over two lines, a pill, a date. */
export function AssignmentCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-hairline bg-surface p-3.5 shadow-tile"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-11/12 rounded bg-gray-200" />
              <div className="h-3.5 w-2/3 rounded bg-gray-200" />
            </div>
            <div className="h-5 w-16 shrink-0 rounded-full bg-gray-100" />
          </div>
          <div className="mt-2.5 h-2.5 w-20 rounded bg-gray-100" />
        </div>
      ))}
    </>
  );
}

/**
 * One student's scenarios, filtered Assigned / Completed / All, as cards to
 * pick one to grade. Mount it with a `key` per student so the filter starts
 * over for each.
 */
export default function AssignmentList({
  assignments,
  selectedId,
  onSelect,
  loading = false,
}: {
  assignments: ScenarioAssignment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  // Opens on what still needs grading; on everything when nothing does.
  const [filter, setFilter] = useState<Filter>(() =>
    assignments.length > 0 && assignments.every((a) => a.status === "completed")
      ? "all"
      : "assigned",
  );
  const visible = assignments.filter((a) => matchesFilter(a, filter));

  return (
    <>
      <div
        role="tablist"
        aria-label="Filter submissions"
        className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-subtle p-1"
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = assignments.filter((a) =>
            matchesFilter(a, f.key),
          ).length;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              title={f.title}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-surface text-gray-900 shadow-tile"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="truncate">{f.label}</span>
              <span
                className={`tabular-nums ${active ? "text-brand-600" : "text-gray-400"}`}
              >
                {loading ? "·" : count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {loading && <AssignmentCardSkeleton />}

        {!loading && visible.length === 0 && (
          <EmptyPanel
            icon={faCheck}
            title="All clear"
            body="Nothing in this view right now."
          />
        )}

        {!loading &&
          visible.map((a, i) => {
            const active = selectedId === a.id;
            const done = a.status === "completed";
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                aria-current={active}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                className={`w-full animate-rise rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-brand-600 bg-brand-50 shadow-tile"
                    : "border-hairline bg-surface shadow-tile hover:border-brand-300 hover:shadow-tile-hover"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold leading-snug text-gray-900">
                    {a.scenario_title}
                  </p>
                  {done ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">
                      {a.score ?? 0}%
                    </span>
                  ) : (
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isSubmitted(a)
                          ? "bg-brand-50 text-brand-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isSubmitted(a) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      )}
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
  );
}

/** Opens on what still needs grading; on everything when nothing does. */
export function initialFilter(
  assignments: readonly ScenarioAssignment[],
): Filter {
  return assignments.length > 0 &&
    assignments.every((a) => a.status === "completed")
    ? "all"
    : "assigned";
}

/** The Assigned / Completed / All filter as a row of tabs, for a page that lays the scenarios out below it. */
export function AssignmentFilterTabs({
  assignments,
  filter,
  onFilterChange,
}: {
  assignments: ScenarioAssignment[];
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter patient cases"
      className="mb-4 inline-grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-subtle p-1"
    >
      {FILTERS.map((f) => {
        const active = filter === f.key;
        const count = assignments.filter((a) => matchesFilter(a, f.key)).length;
        return (
          <button
            key={f.key}
            role="tab"
            aria-selected={active}
            onClick={() => onFilterChange(f.key)}
            title={f.title}
            className={`flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              active
                ? "bg-surface text-gray-900 shadow-tile"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {f.label}
            <span
              className={`tabular-nums ${active ? "text-brand-600" : "text-gray-400"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
