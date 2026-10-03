"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faListCheck, faUserCheck, faUsers } from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../../components/Avatar";
import { usePageData } from "../../../lib/use-page-data";
import { fetchCourseProgress, type CourseProgress } from "../../../lib/api";
import type { ItemProgress } from "../../../lib/course-progress";
import { ItemStatus, canAct, statusText, useTicks } from "../progress-ui";

type Filter = "all" | "incomplete" | "complete";

/**
 * Every student on the course's roster against every checklist item.
 * Automatic items tick themselves from graded work; a manual item is ticked
 * here, and an automatic one can be marked done with a note. `signature`
 * changes with the checklist, so an edited checklist is fetched afresh.
 */
export default function ProgressTab({ offeringId, signature }: { offeringId: string; signature: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, loading, setData } = usePageData(`faculty:course-progress:${offeringId}:${signature}`, () =>
    fetchCourseProgress(offeringId),
  );
  const progress = data?.data ?? null;

  // Rows are ranked once, lowest progress first, and keep that order while the
  // instructor works: every write refetches the grid, and re-sorting then
  // would move the row being ticked out from under the pointer.
  const rosterKey = (progress?.students ?? []).map((s) => s.id).sort().join(",");
  const [order, setOrder] = useState<{ key: string; rank: Record<string, number> } | null>(null);
  if (progress && order?.key !== rosterKey) {
    const ranked = [...progress.students].sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name));
    setOrder({ key: rosterKey, rank: Object.fromEntries(ranked.map((s, i) => [s.id, i])) });
  }

  const { act, busy, dialog } = useTicks((studentId, requirementId, item) =>
    setData((prev) => {
      if (!prev?.data) return prev!;
      return { data: applyTick(prev.data, studentId, requirementId, item) };
    }),
  );

  const students = useMemo(() => {
    const rank = order?.rank ?? {};
    const list = [...(progress?.students ?? [])].sort((a, b) => (rank[a.id] ?? 0) - (rank[b.id] ?? 0));
    if (filter === "complete") return list.filter((s) => s.total > 0 && s.done === s.total);
    if (filter === "incomplete") return list.filter((s) => s.done < s.total);
    return list;
  }, [progress?.students, order?.rank, filter]);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl border border-hairline bg-surface" aria-hidden />;
  }
  if (data?.error) {
    return <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.error}</div>;
  }
  if (!progress || progress.requirements.length === 0) {
    return (
      <EmptyState icon={faListCheck} title="No requirements yet">
        Add requirements on the Requirements tab; each student&rsquo;s progress shows here.
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

  const complete = progress.students.filter((s) => s.total > 0 && s.done === s.total).length;
  const reqs = progress.requirements;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Show students">
          {(
            [
              ["all", `All (${progress.students.length})`],
              ["incomplete", `Incomplete (${progress.students.length - complete})`],
              ["complete", `Complete (${complete})`],
            ] as const
          ).map(([key, label]) => (
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
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />
            </span>
            Met by graded work
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <FontAwesomeIcon icon={faUserCheck} className="h-2 w-2" />
            </span>
            Ticked or marked by you
          </span>
        </div>
      </div>

      <div className="overflow-clip rounded-xl border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[15rem] border-b border-hairline bg-subtle px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Student
                </th>
                {reqs.map((r, i) => (
                  <th
                    key={r.id}
                    title={r.title ? `${r.title}: ${r.label}` : r.label}
                    className="min-w-[7.5rem] max-w-[10rem] border-b border-hairline bg-subtle px-2 py-3 text-left align-bottom"
                  >
                    <span className="block text-[11px] font-semibold text-gray-400">#{i + 1}</span>
                    <span className="line-clamp-2 text-xs font-medium text-gray-700">{r.title || r.label}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-brand-700">
                      {progress.totals[r.id] ?? 0}/{progress.students.length}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-hairline bg-surface px-4 py-2.5 group-hover:bg-subtle">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} src={s.picture_url} userId={s.id} sex={s.sex} size="sm" />
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
                  {reqs.map((r) => {
                    const item = progress.progress[s.id]?.[r.id];
                    const actionable = canAct(r, item);
                    const text = statusText(r, item);
                    const key = `${s.id}:${r.id}`;
                    return (
                      <td key={r.id} className="border-b border-hairline px-2 py-2.5 group-hover:bg-subtle">
                        <button
                          type="button"
                          title={text}
                          aria-label={`${s.name}, ${r.title || r.label}: ${text}`}
                          disabled={!actionable || busy === key}
                          onClick={() => act(offeringId, s, r, item)}
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
        Click a manual item to tick it. Click an automatic item to mark it done with a note, for work done outside the
        app. Items met by graded work can&rsquo;t be unticked.
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

function EmptyState({ icon, title, children }: { icon: typeof faListCheck; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
      <FontAwesomeIcon icon={icon} className="mb-3 h-7 w-7 text-gray-300" />
      <p className="font-semibold text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{children}</p>
    </div>
  );
}
