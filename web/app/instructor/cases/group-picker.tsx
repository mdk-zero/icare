"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown, faLayerGroup, faUsers } from "@fortawesome/free-solid-svg-icons";
import type { CourseRosterStudent } from "../../lib/api";
import { useCourseAudience } from "../../components/AudiencePicker";
import { EcgLoader } from "../../components/EcgLoader";

/**
 * Picks the groups that report a case presentation, and each one's leader:
 * the member who uploads the group's slides. Only the instructor's own groups
 * in the course are offered; a case presentation is always a group's.
 *
 * The value maps a picked group's id to its leader's id ("" until one is chosen).
 */
export type GroupPick = Record<string, string>;

interface GroupUnit {
  id: string;
  name: string;
  members: CourseRosterStudent[];
}

interface SectionBlock {
  id: string;
  name: string;
  groups: GroupUnit[];
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function buildGroups(roster: CourseRosterStudent[]): SectionBlock[] {
  const sections = new Map<string, SectionBlock>();
  for (const s of roster) {
    if (s.source !== "group" || !s.team_id) continue;
    const block = sections.get(s.section_id) ?? { id: s.section_id, name: s.section, groups: [] };
    sections.set(s.section_id, block);
    let group = block.groups.find((g) => g.id === s.team_id);
    if (!group) {
      group = { id: s.team_id, name: s.group, members: [] };
      block.groups.push(group);
    }
    group.members.push(s);
  }
  for (const block of sections.values()) {
    block.groups.sort((a, b) => natural(a.name, b.name));
    for (const g of block.groups) g.members.sort((a, b) => natural(a.name, b.name));
  }
  return [...sections.values()].sort((a, b) => natural(a.name, b.name));
}

/** What a pick means for the API, and whether every picked group has its leader. */
export function groupPayload(value: GroupPick, roster: CourseRosterStudent[] | undefined) {
  const groups = Object.entries(value).map(([team_id, leader_id]) => ({ team_id, leader_id }));
  const members = new Set(
    (roster ?? []).filter((s) => s.source === "group" && s.team_id && s.team_id in value).map((s) => s.id),
  );
  return {
    groups,
    count: groups.length,
    students: members.size,
    leadersChosen: groups.length > 0 && groups.every((g) => g.leader_id),
  };
}

export default function CaseGroupPicker({
  offeringId,
  value,
  onChange,
  given = [],
  disabled = false,
}: {
  offeringId: string;
  value: GroupPick;
  onChange: (next: GroupPick) => void;
  /** Groups that already report it: shown, locked. */
  given?: readonly string[];
  disabled?: boolean;
}) {
  const { roster, error, loading } = useCourseAudience(offeringId);
  const sections = useMemo(() => buildGroups(roster ?? []), [roster]);

  const toggle = (id: string) => {
    if (given.includes(id)) return;
    const next = { ...value };
    if (id in next) delete next[id];
    else next[id] = "";
    onChange(next);
  };

  if (loading && !roster) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-hairline p-4 text-sm text-gray-500">
        <EcgLoader className="text-brand-600" /> Loading the course&apos;s groups…
      </p>
    );
  }
  if (error) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  if (sections.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        You have no groups in this course yet. Make them in Students &amp; Groups first; a case presentation is reported
        by a group.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div className="max-h-[28rem] divide-y divide-hairline overflow-y-auto">
        {sections.map((block) => (
          <div key={block.id}>
            <p className="flex items-center gap-2 bg-subtle px-4 py-2 text-sm font-semibold text-gray-900">
              <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-brand-600" />
              {block.name}
            </p>
            {block.groups.map((g) => {
              const isGiven = given.includes(g.id);
              const on = isGiven || g.id in value;
              const leader = value[g.id] ?? "";
              return (
                <div key={g.id} className={`px-4 py-2.5 ${on && !isGiven ? "bg-brand-600/5" : ""}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled || isGiven}
                      onChange={() => toggle(g.id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">{g.name}</span>
                    {isGiven && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Given
                      </span>
                    )}
                    <span className="ml-auto text-xs tabular-nums text-gray-400">
                      {g.members.length} member{g.members.length === 1 ? "" : "s"}
                    </span>
                  </label>
                  {on && !isGiven ? (
                    <div className="mt-2 flex flex-col gap-2 pl-7 sm:flex-row sm:items-center">
                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700" htmlFor={`leader-${g.id}`}>
                        <FontAwesomeIcon icon={faCrown} className="h-3 w-3 text-amber-500" />
                        Group leader
                      </label>
                      <select
                        id={`leader-${g.id}`}
                        value={leader}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...value, [g.id]: e.target.value })}
                        className={`w-full rounded-lg border bg-surface px-3 py-1.5 text-sm sm:max-w-xs ${
                          leader ? "border-gray-300 text-gray-900" : "border-amber-300 text-gray-500"
                        } focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30`}
                      >
                        <option value="">Choose who reports…</option>
                        {g.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    !isGiven && (
                      <p className="mt-0.5 truncate pl-7 text-xs text-gray-500">{g.members.map((m) => m.name).join(", ")}</p>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
