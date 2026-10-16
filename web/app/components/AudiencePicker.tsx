"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faUserPlus, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { fetchCourseRoster, type CourseRosterStudent } from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { EcgLoader } from "./EcgLoader";

/**
 * Who a course activity goes to, picked from the course's roster as the
 * instructor handles it: by section, then by group within it. A section
 * where they supervise no group is picked whole, and students they added to
 * the course by hand are one more choice.
 *
 * A pick is a list of keys: "team:<id>", "section:<id>" (a whole section) and
 * "added". audiencePayload() turns it into what the assign APIs take.
 */

export interface AudiencePayload {
  team_ids: string[];
  section_ids: string[];
  student_ids: string[];
  /** Distinct students reached. */
  count: number;
  /** Their ids. */
  reached: string[];
}

interface Unit {
  key: string;
  label: string;
  students: CourseRosterStudent[];
}

interface SectionBlock {
  id: string;
  name: string;
  units: Unit[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

function buildUnits(roster: CourseRosterStudent[]): { sections: SectionBlock[]; added: Unit | null } {
  const sections = new Map<string, SectionBlock>();
  const added: CourseRosterStudent[] = [];
  for (const s of roster) {
    if (s.source === "added") {
      added.push(s);
      continue;
    }
    const block = sections.get(s.section_id) ?? { id: s.section_id, name: s.section, units: [] };
    sections.set(s.section_id, block);
    // A group of theirs is its own pick; a whole section (no group of theirs there) is one pick.
    const key = s.source === "group" && s.team_id ? `team:${s.team_id}` : `section:${s.section_id}`;
    let unit = block.units.find((u) => u.key === key);
    if (!unit) {
      unit = { key, label: key.startsWith("team:") ? s.group : "Whole section", students: [] };
      block.units.push(unit);
    }
    unit.students.push(s);
  }
  for (const block of sections.values()) block.units.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return {
    sections: [...sections.values()].sort(byName),
    added: added.length ? { key: "added", label: "Added by you", students: added } : null,
  };
}

/** What a pick means for the assign APIs. */
export function audiencePayload(roster: CourseRosterStudent[] | undefined, picked: readonly string[]): AudiencePayload {
  const { sections, added } = buildUnits(roster ?? []);
  const units = [...sections.flatMap((b) => b.units), ...(added ? [added] : [])].filter((u) => picked.includes(u.key));
  const reached = new Set(units.flatMap((u) => u.students.map((s) => s.id)));
  return {
    team_ids: units.filter((u) => u.key.startsWith("team:")).map((u) => u.key.slice(5)),
    section_ids: units.filter((u) => u.key.startsWith("section:")).map((u) => u.key.slice(8)),
    student_ids: units.filter((u) => u.key === "added").flatMap((u) => u.students.map((s) => s.id)),
    count: reached.size,
    reached: [...reached],
  };
}

/** The course's roster, shared with audiencePayload(). */
export function useCourseAudience(offeringId: string | null) {
  const { data, loading } = usePageData(offeringId ? `faculty:course-roster:${offeringId}` : null, () => fetchCourseRoster(offeringId!));
  return { roster: data?.data?.students, error: data?.error, loading };
}

/** "Due Oct 16, 11:59 PM" for the students of a unit who already have it. */
function assignedLabel(students: CourseRosterStudent[], assigned: ReadonlyMap<string, string | null>): string | null {
  const have = students.filter((s) => assigned.has(s.id));
  if (have.length === 0) return null;
  const deadlines = [...new Set(have.map((s) => assigned.get(s.id) ?? ""))];
  const due =
    deadlines.length > 1
      ? "different deadlines"
      : deadlines[0]
        ? `due ${new Date(deadlines[0]).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "no deadline";
  return `${have.length === students.length ? "Assigned" : `${have.length} of ${students.length} assigned`} · ${due}`;
}

export default function AudiencePicker({
  offeringId,
  value,
  onChange,
  /** Keys already given the activity: shown ticked and locked. */
  given = [],
  assigned,
  hideAssigned = false,
}: {
  offeringId: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  given?: readonly string[];
  /**
   * Who already has it, by student, with their deadline: shown on each group
   * and still pickable, so picking it again sets a new deadline for it.
   */
  assigned?: ReadonlyMap<string, string | null>;
  /** Leave out groups whose students all have it already. */
  hideAssigned?: boolean;
}) {
  const { roster, error, loading } = useCourseAudience(offeringId);
  const built = useMemo(() => buildUnits(roster ?? []), [roster]);
  // Only who is still left, when asked: a group everyone in has it drops out.
  const { sections, added } = useMemo(() => {
    if (!hideAssigned || !assigned) return built;
    const open = (u: Unit) => u.students.some((st) => !assigned.has(st.id));
    return {
      sections: built.sections.map((b) => ({ ...b, units: b.units.filter(open) })).filter((b) => b.units.length > 0),
      added: built.added && open(built.added) ? built.added : null,
    };
  }, [built, hideAssigned, assigned]);
  const allKeys = [...sections.flatMap((b) => b.units.map((u) => u.key)), ...(added ? [added.key] : [])].filter(
    (k) => !given.includes(k),
  );
  const isOn = (key: string) => given.includes(key) || value.includes(key);
  const toggle = (keys: string[]) => {
    const open = keys.filter((k) => !given.includes(k));
    const allOn = open.every((k) => value.includes(k));
    onChange(allOn ? value.filter((k) => !open.includes(k)) : [...new Set([...value, ...open])]);
  };

  if (loading && !roster) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-hairline p-4 text-sm text-gray-500">
        <EcgLoader className="text-brand-600" /> Loading the course&apos;s students…
      </p>
    );
  }
  if (error) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  if (sections.length === 0 && !added && hideAssigned && built.sections.length > 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        Everyone in this course already has it. Change a group&apos;s deadline with the group button beside Assign on the quiz card.
      </p>
    );
  }
  if (sections.length === 0 && !added) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        No students in this course yet. They join through its sections and your groups.
      </p>
    );
  }

  const everyone = allKeys.length > 0 && allKeys.every((k) => value.includes(k));
  const count = audiencePayload(roster, [...value, ...given]).count;

  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <label className="flex cursor-pointer items-center gap-3 border-b border-hairline bg-subtle px-4 py-2.5">
        <input
          type="checkbox"
          checked={everyone}
          disabled={allKeys.length === 0}
          onChange={() => toggle(allKeys)}
          className="h-4 w-4 accent-brand-600"
        />
        <span className="text-sm font-semibold text-gray-800">Everyone in this course</span>
        <span className="ml-auto text-xs tabular-nums text-gray-500">{count} selected</span>
      </label>
      <div className="max-h-72 divide-y divide-hairline overflow-y-auto">
        {sections.map((block) => {
          const keys = block.units.map((u) => u.key);
          const on = keys.filter(isOn).length;
          const total = new Set(block.units.flatMap((u) => u.students.map((s) => s.id))).size;
          return (
            <div key={block.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                <input
                  type="checkbox"
                  checked={on === keys.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on > 0 && on < keys.length;
                  }}
                  disabled={keys.every((k) => given.includes(k))}
                  onChange={() => toggle(keys)}
                  className="h-4 w-4 accent-brand-600"
                />
                <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-brand-600" />
                <span className="text-sm font-semibold text-gray-900">{block.name}</span>
                <span className="ml-auto text-xs tabular-nums text-gray-500">
                  {total} student{total === 1 ? "" : "s"}
                </span>
              </label>
              {block.units.map((unit) => (
                <label key={unit.key} className="flex cursor-pointer items-center gap-3 py-2 pl-11 pr-4 hover:bg-subtle">
                  <input
                    type="checkbox"
                    checked={isOn(unit.key)}
                    disabled={given.includes(unit.key)}
                    onChange={() => toggle([unit.key])}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                  <span className="text-sm text-gray-700">{unit.label}</span>
                  {given.includes(unit.key) && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Given</span>
                  )}
                  {assigned && assignedLabel(unit.students, assigned) && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      {assignedLabel(unit.students, assigned)}
                    </span>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-gray-400">{unit.students.length}</span>
                </label>
              ))}
            </div>
          );
        })}
        {added && (
          <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-subtle">
            <input
              type="checkbox"
              checked={isOn(added.key)}
              disabled={given.includes(added.key)}
              onChange={() => toggle([added.key])}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <FontAwesomeIcon icon={faUserPlus} className="mt-0.5 h-3.5 w-3.5 text-brand-600" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">{added.label}</span>
              <span className="block truncate text-xs text-gray-500">{added.students.map((s) => s.name).join(", ")}</span>
              {assigned && assignedLabel(added.students, assigned) && (
                <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {assignedLabel(added.students, assigned)}
                </span>
              )}
            </span>
            <span className="ml-auto text-xs tabular-nums text-gray-500">{added.students.length}</span>
          </label>
        )}
      </div>
    </div>
  );
}
