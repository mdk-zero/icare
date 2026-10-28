"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAddressCard, faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import type { FacultyTeam } from "../../lib/api";

/**
 * A section opens on its students, listed under their groups with each
 * profile a click away. Edit groups swaps in the group cards and the
 * drag-and-drop table of who is left to place.
 */
export function RosterModeToggle({
  editing,
  onChange,
}: {
  editing: boolean;
  onChange: (editing: boolean) => void;
}) {
  const modes = [
    { editing: false, label: "Students", icon: faAddressCard },
    { editing: true, label: "Edit groups", icon: faPeopleGroup },
  ];
  return (
    <div role="radiogroup" aria-label="Section view" className="inline-flex rounded-xl border border-hairline bg-surface p-1">
      {modes.map((mode) => (
        <button
          key={mode.label}
          type="button"
          role="radio"
          aria-checked={editing === mode.editing}
          onClick={() => onChange(mode.editing)}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
            editing === mode.editing ? "bg-brand-600 text-white" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FontAwesomeIcon icon={mode.icon} className="h-3.5 w-3.5" />
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export interface GroupBucket<T> {
  /** Null for the students in no group, or for a section with no groups at all. */
  group: FacultyTeam | null;
  /** Everyone in the bucket, before the search and filter. */
  total: number;
  /** Those the search and filter leave showing. */
  rows: T[];
}

/**
 * A section's students under their groups, in group order, with whoever is in
 * none last. A section without groups is one bucket, drawn with no heading.
 * Buckets the search empties are dropped.
 */
export function bucketByGroup<T extends { id: string }>(
  students: T[],
  groups: FacultyTeam[],
  shows: (student: T) => boolean,
): GroupBucket<T>[] {
  const buckets: GroupBucket<T>[] = [
    ...groups.map((group) => ({ group, total: 0, rows: [] as T[] })),
    { group: null, total: 0, rows: [] },
  ];
  const bucketOf = new Map<string, GroupBucket<T>>();
  groups.forEach((group, i) => group.members.forEach((m) => bucketOf.set(m.id, buckets[i])));
  for (const student of students) {
    const bucket = bucketOf.get(student.id) ?? buckets[groups.length];
    bucket.total++;
    if (shows(student)) bucket.rows.push(student);
  }
  return buckets.filter((b) => b.rows.length > 0);
}

/** The heading row above a group's students in the roster table. */
export function GroupHeadingRow({
  bucket,
  colSpan,
  showInstructor,
}: {
  bucket: GroupBucket<unknown>;
  colSpan: number;
  /** The dean sees who supervises each group; an instructor's groups are their own. */
  showInstructor: boolean;
}) {
  const { group, total, rows } = bucket;
  const count = rows.length === total ? `${total} student${total === 1 ? "" : "s"}` : `${rows.length} of ${total} students`;
  return (
    <tr className="bg-subtle">
      <td colSpan={colSpan} className="px-4 py-2 sm:px-6">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-gray-800">{group?.name ?? "Not in a group"}</span>
          <span className="text-xs text-gray-500">{count}</span>
          {group && showInstructor && (
            <span className="text-xs text-gray-500">· {group.faculty_name ?? "No instructor yet"}</span>
          )}
        </p>
      </td>
    </tr>
  );
}
