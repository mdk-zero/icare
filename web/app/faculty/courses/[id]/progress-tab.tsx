"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faListCheck, faMagnifyingGlass, faUserCheck, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../../components/Avatar";
import { SkeletonProgressGrid } from "../../../components/skeletons";
import { usePageData } from "../../../lib/use-page-data";
import { fetchCourseProgress, type CourseProgress } from "../../../lib/api";
import { requirementDetail, requirementNames, type ItemProgress } from "../../../lib/course-progress";
import { ItemStatus, canAct, statusText, useEntryDialog } from "../progress-ui";

type Filter = "all" | "incomplete" | "complete";

/**
 * Every student on the course's roster against every checklist item, with
 * search, a group filter and a complete/incomplete filter on top. A column's
 * name explains what the item asks for; a cell opens score entry where the
 * student has no grade. `signature` changes with the checklist, so an edited
 * checklist is fetched afresh.
 */
export default function ProgressTab({
  offeringId,
  signature,
  onOpenRequirements,
}: {
  offeringId: string;
  signature: string;
  onOpenRequirements: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const { data, loading, setData } = usePageData(`faculty:course-progress:${offeringId}:${signature}`, () =>
    fetchCourseProgress(offeringId),
  );
  const progress = data?.data ?? null;

  // Rows are ranked once, lowest progress first, and keep that order while the
  // instructor works: every write refetches the grid, and re-sorting then
  // would move the row being scored out from under the pointer.
  const rosterKey = (progress?.students ?? []).map((s) => s.id).sort().join(",");
  const [order, setOrder] = useState<{ key: string; rank: Record<string, number> } | null>(null);
  if (progress && order?.key !== rosterKey) {
    const ranked = [...progress.students].sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name));
    setOrder({ key: rosterKey, rank: Object.fromEntries(ranked.map((s, i) => [s.id, i])) });
  }

  const { act, busy, dialog } = useEntryDialog((studentId, requirementId, item) =>
    setData((prev) => {
      if (!prev?.data) return prev!;
      return { data: applyTick(prev.data, studentId, requirementId, item) };
    }),
  );

  const groups = useMemo(
    () =>
      [...new Set((progress?.students ?? []).map((s) => s.group_label).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [progress?.students],
  );

  // Search and group narrow the roster; the status counts follow what is left.
  const scoped = useMemo(() => {
    const rank = order?.rank ?? {};
    const q = query.trim().toLowerCase();
    return [...(progress?.students ?? [])]
      .sort((a, b) => (rank[a.id] ?? 0) - (rank[b.id] ?? 0))
      .filter((s) => (!group || s.group_label === group) && (!q || s.name.toLowerCase().includes(q)));
  }, [progress?.students, order?.rank, query, group]);
  const isComplete = (s: { done: number; total: number }) => s.total > 0 && s.done === s.total;
  const students =
    filter === "complete" ? scoped.filter(isComplete) : filter === "incomplete" ? scoped.filter((s) => !isComplete(s)) : scoped;

  if (loading) {
    return <SkeletonProgressGrid />;
  }
  if (data?.error) {
    return <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.error}</div>;
  }
  if (!progress || progress.requirements.length === 0) {
    return (
      <EmptyState
        icon={faListCheck}
        title="No requirements yet"
        action={
          <button
            type="button"
            onClick={onOpenRequirements}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5" />
            Set up the checklist
          </button>
        }
      >
        List what your students must accomplish this term; each student&rsquo;s progress shows here.
      </EmptyState>
    );
  }
  if (progress.students.length === 0) {
    return (
      <EmptyState icon={faUsers} title="No students yet">
        Students come from the groups you supervise in this course&rsquo;s sections.
      </EmptyState>
    );
  }

  const complete = scoped.filter(isComplete).length;
  const reqs = progress.requirements;
  const names = requirementNames(reqs);
  const focusIndex = reqs.findIndex((r) => r.id === focus);
  const focused = focusIndex >= 0 ? reqs[focusIndex] : null;
  const narrowed = query.trim() !== "" || group !== "";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students"
            aria-label="Search students"
            className="w-full rounded-xl border border-gray-200 bg-surface py-2 pl-10 pr-3 text-sm text-gray-700 placeholder:text-gray-400 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/50"
          />
        </div>
        {groups.length > 1 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Group"
            className="rounded-xl border border-gray-200 bg-surface py-2 pl-3 pr-8 text-sm text-gray-700 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/50"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Show students">
          {(
            [
              ["all", "All", scoped.length],
              ["incomplete", "Incomplete", scoped.length - complete],
              ["complete", "Complete", complete],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === key ? "bg-surface text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label} <span className="text-xs opacity-70">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 items-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">
            86%
          </span>
          Met by graded work
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 items-center rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            62%
          </span>
          Not met yet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <FontAwesomeIcon icon={faUserCheck} className="h-2 w-2" />
          </span>
          Entered or marked by you
        </span>
        <span className="flex items-center gap-1.5 sm:ml-auto">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3 text-gray-400" />
          Tap a column&rsquo;s name to see what it asks for
        </span>
      </div>

      {focused && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-brand-600/20 bg-brand-600/5 px-4 py-3 text-sm" role="status">
          <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-gray-700">
              <span className="font-semibold text-gray-900">{names[focusIndex]}</span> · {requirementDetail(focused)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {progress.totals[focused.id] ?? 0} of {progress.students.length} students met it
              {focused.kind === "manual" ? " · click a student’s cell to enter their score" : ""}
            </p>
          </div>
          <button type="button" onClick={onOpenRequirements} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">
            Edit
          </button>
          <button
            type="button"
            onClick={() => setFocus(null)}
            aria-label="Close"
            className="-m-1 shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-brand-600/10 hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-clip rounded-xl border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[11rem] border-b border-hairline bg-subtle px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:min-w-[15rem] sm:px-4">
                  Student
                </th>
                {reqs.map((r, i) => {
                  const on = r.id === focus;
                  return (
                    <th
                      key={r.id}
                      className={`min-w-[7.5rem] border-b border-hairline px-2 py-2 text-left align-bottom transition-colors ${
                        on ? "bg-brand-600/10" : "bg-subtle"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setFocus(on ? null : r.id)}
                        aria-pressed={on}
                        title={requirementDetail(r)}
                        className="group/col -mx-1 block w-[calc(100%+0.5rem)] rounded-lg px-1 py-1 text-left transition-colors hover:bg-brand-600/10"
                      >
                        <span
                          className={`flex items-center gap-1 whitespace-nowrap text-xs font-medium ${
                            on ? "text-brand-800" : "text-gray-700 group-hover/col:text-brand-700"
                          }`}
                        >
                          {names[i]}
                          <FontAwesomeIcon
                            icon={faCircleInfo}
                            className={`h-2.5 w-2.5 ${on ? "text-brand-600" : "text-gray-300 group-hover/col:text-brand-600"}`}
                          />
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold text-brand-700">
                          {progress.totals[r.id] ?? 0}/{progress.students.length}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={reqs.length + 1} className="px-4 py-10 text-center text-sm text-gray-500">
                    {narrowed ? "No students match your search or group." : "No students in this view."}
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr key={s.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-hairline bg-surface px-3 py-2.5 group-hover:bg-subtle sm:px-4">
                    <div className="flex items-center gap-3">
                      <span className="hidden shrink-0 sm:block">
                        <Avatar name={s.name} src={s.picture_url} userId={s.id} sex={s.sex} size="sm" />
                      </span>
                      <div className="min-w-0">
                        <Link href={`/faculty/students/${s.id}`} className="block truncate font-medium text-gray-800 hover:underline">
                          {s.name}
                        </Link>
                        <p className="truncate text-xs text-gray-500">{s.group_label}</p>
                      </div>
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          s.total > 0 && s.done === s.total ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {s.done}/{s.total}
                      </span>
                    </div>
                  </td>
                  {reqs.map((r, i) => {
                    const item = progress.progress[s.id]?.[r.id];
                    const actionable = canAct(r, item);
                    const text = statusText(r, item);
                    const key = `${s.id}:${r.id}`;
                    return (
                      <td
                        key={r.id}
                        className={`border-b border-hairline px-2 py-2.5 group-hover:bg-subtle ${r.id === focus ? "bg-brand-600/[0.04]" : ""}`}
                      >
                        <button
                          type="button"
                          title={text}
                          aria-label={`${s.name}, ${names[i]}: ${text}`}
                          disabled={!actionable || busy === key}
                          onClick={() => act(offeringId, s, r, names[i], item)}
                          className={`rounded-full transition-transform ${
                            actionable ? "cursor-pointer hover:scale-110" : "cursor-default"
                          } ${busy === key ? "animate-pulse" : ""}`}
                        >
                          <ItemStatus requirement={r} item={item} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        A cell shows the best score on that activity or skill; a count shows the average across that work this term. Click
        a cell with no grade to enter the score the student earned outside the app; on a count, each score adds one more
        piece of work. Grades from graded work can&rsquo;t be changed here.
      </p>
      {dialog}
    </div>
  );
}

function ratio(s: { done: number; total: number }) {
  return s.total === 0 ? 1 : s.done / s.total;
}

/** The progress after one tick: the cell, the student's count and the item's total. */
function applyTick(data: CourseProgress, studentId: string, requirementId: string, item: ItemProgress): CourseProgress {
  const before = data.progress[studentId]?.[requirementId]?.done ?? false;
  const delta = Number(item.done) - Number(before);
  return {
    ...data,
    progress: { ...data.progress, [studentId]: { ...data.progress[studentId], [requirementId]: item } },
    students: data.students.map((s) => (s.id === studentId ? { ...s, done: s.done + delta } : s)),
    totals: { ...data.totals, [requirementId]: (data.totals[requirementId] ?? 0) + delta },
  };
}

function EmptyState({
  icon,
  title,
  action,
  children,
}: {
  icon: typeof faListCheck;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
      <FontAwesomeIcon icon={icon} className="mb-3 h-7 w-7 text-gray-300" />
      <p className="font-semibold text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{children}</p>
      {action}
    </div>
  );
}
