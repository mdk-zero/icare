"use client";

import { createContext, useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserGroup } from "@fortawesome/free-solid-svg-icons";
import type { CourseProgress } from "../../../lib/api";

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * Which student groups each checklist item is given to, read off the Progress
 * data: a group has an item when any of its students has it (an activity item
 * not given to a student is `assigned: false` there). null for an item every
 * student on the roster has, which needs no tag.
 */
export function itemGroupsFrom(progress: CourseProgress | null | undefined) {
  const byItem = new Map<string, string[] | null>();
  const groups = new Set<string>();
  if (!progress) return { byItem, groups: [] as string[] };
  for (const s of progress.students) groups.add(s.group_label);
  for (const r of progress.requirements) {
    const given = progress.students.filter((s) => progress.progress[s.id]?.[r.id]?.assigned !== false);
    byItem.set(
      r.id,
      given.length === progress.students.length ? null : [...new Set(given.map((s) => s.group_label))].sort(byLabel),
    );
  }
  return { byItem, groups: [...groups].sort(byLabel) };
}

/** The groups of each item, so the rows can show them without passing them down every list. */
export const ItemGroupsContext = createContext<Map<string, string[] | null>>(new Map());

/** The groups an item is given to, under its name; nothing for an item everyone has. */
export function ItemGroupTags({ requirementId }: { requirementId: string }) {
  const groups = useContext(ItemGroupsContext).get(requirementId);
  if (!groups) return null;
  if (groups.length === 0) {
    return <p className="mt-1 text-[11px] text-gray-400">Not given to any group yet</p>;
  }
  const first = groups.slice(0, 3);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1">
      <FontAwesomeIcon icon={faUserGroup} className="h-2.5 w-2.5 text-gray-400" aria-hidden />
      <span className="sr-only">Given to</span>
      {first.map((g) => (
        <span key={g} className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-medium text-brand-700">
          {g}
        </span>
      ))}
      {groups.length > first.length && (
        <span className="text-[11px] text-gray-500" title={groups.slice(first.length).join(", ")}>
          +{groups.length - first.length} more
        </span>
      )}
    </p>
  );
}

/** The group filter above the checklist; only when there is more than one group to pick from. */
export function GroupFilter({
  groups,
  value,
  onChange,
  shown,
  total,
}: {
  groups: string[];
  value: string;
  onChange: (group: string) => void;
  shown: number;
  total: number;
}) {
  if (groups.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <FontAwesomeIcon icon={faUserGroup} className="h-3.5 w-3.5 text-gray-400" aria-hidden />
        Group
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-800 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <span className="text-sm text-gray-500">
          {shown} of {total} items are given to {value}.{" "}
          <button type="button" onClick={() => onChange("")} className="font-semibold text-brand-700 hover:underline">
            Show all
          </button>
        </span>
      )}
    </div>
  );
}
