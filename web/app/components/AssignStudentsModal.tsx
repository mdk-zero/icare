"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDay, faCheck, faSearch, faTimes, faUser, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import { fetchCourseRoster, type CourseRosterStudent } from "../lib/api";
import { deadlineFromInput } from "../lib/deadline-input";
import Avatar from "./Avatar";
import { EcgLoader } from "./EcgLoader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

/**
 * Assigning a patient case or a Return Demonstration: a date of performance,
 * then the students the instructor handles in its course, one block per
 * section with a sticky row per group. Who already has it shows as Assigned
 * and can't be picked again. Shared so both read the same.
 */
export default function AssignStudentsModal({
  heading,
  title,
  noun,
  offeringId,
  fallbackOfferingIds,
  alreadyAssigned,
  sexOf,
  note,
  onClose,
  onAssign,
}: {
  /** "Assign Patient Case" */
  heading: string;
  /** What is being assigned. */
  title: string;
  /** "patient case": for the hints. */
  noun: string;
  /** Its course; null lists the students of every course in `fallbackOfferingIds`. */
  offeringId: string | null;
  fallbackOfferingIds: string[];
  alreadyAssigned: ReadonlySet<string>;
  /** For the avatars, when the page knows it. */
  sexOf?: (studentId: string) => "male" | "female" | null | undefined;
  /** Shown above the student list. */
  note?: ReactNode;
  onClose: () => void;
  /** Gets the picked students and the deadline (end of the picked day); resolves when done. */
  onAssign: (studentIds: string[], deadline: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [assigning, setAssigning] = useState(false);
  // Null while loading.
  const [roster, setRoster] = useState<CourseRosterStudent[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const offeringKey = offeringId ?? fallbackOfferingIds.join(",");
  useEffect(() => {
    let live = true;
    const ids = offeringId ? [offeringId] : fallbackOfferingIds;
    void Promise.all(ids.map((id) => fetchCourseRoster(id))).then((results) => {
      if (!live) return;
      const byId = new Map<string, CourseRosterStudent>();
      for (const res of results) for (const st of res.data?.students ?? []) if (!byId.has(st.id)) byId.set(st.id, st);
      const failed = results.find((res) => res.error);
      setRosterError(failed && byId.size === 0 ? (failed.error ?? "Unable to load your students") : null);
      setRoster([...byId.values()]);
    });
    return () => {
      live = false;
    };
    // The ids are captured by offeringKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringKey]);

  const pickable = (ids: string[]) => ids.filter((id) => !alreadyAssigned.has(id));
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  /** Ticks or clears a whole block of students at once. */
  const toggleMany = (ids: string[]) =>
    setSelected((prev) => {
      const all = ids.every((id) => prev.includes(id));
      return all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });

  const q = query.trim().toLowerCase();
  const filtered = (roster ?? []).filter(
    (st) => !q || `${st.name} ${st.email} ${st.section} ${st.group}`.toLowerCase().includes(q),
  );
  // Section, then group, then name: one block per section with a row per group.
  const sections = (() => {
    const out = new Map<string, Map<string, CourseRosterStudent[]>>();
    const sorted = [...filtered].sort(
      (a, b) =>
        a.section.localeCompare(b.section, undefined, { numeric: true }) ||
        Number(a.group === "No group") - Number(b.group === "No group") ||
        a.group.localeCompare(b.group, undefined, { numeric: true }) ||
        a.name.localeCompare(b.name),
    );
    for (const st of sorted) {
      const groups = out.get(st.section) ?? new Map<string, CourseRosterStudent[]>();
      groups.set(st.group, [...(groups.get(st.group) ?? []), st]);
      out.set(st.section, groups);
    }
    return [...out.entries()].map(([section, groups]) => ({ section, groups: [...groups.entries()] }));
  })();
  const shownIds = pickable(filtered.map((s) => s.id));
  const count = selected.length;

  const submit = async () => {
    const deadline = deadlineFromInput(date);
    if (count === 0 || !deadline) return;
    setAssigning(true);
    try {
      await onAssign(selected, deadline);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-students-title"
        className="bg-surface rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline"
      >
        <div className="p-4 border-b border-hairline bg-subtle">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
                <FontAwesomeIcon icon={faUserPlus} className="text-brand-600 w-5 h-5" />
              </div>
              <div>
                <h2 id="assign-students-title" className="text-lg font-bold text-gray-900">
                  {heading}
                </h2>
                <p className="text-sm text-gray-500">{title}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarDay} className="text-brand-600" />
              Assignment Settings
            </h3>
            <div>
              <label htmlFor="assign-students-date" className={labelClassName}>
                Date of performance
              </label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faCalendarDay}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                />
                <input
                  id="assign-students-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClassName + " pl-10"}
                />
              </div>
            </div>
          </div>

          {note}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FontAwesomeIcon icon={faUser} className="text-brand-600" />
                Select Students
              </h3>
              <button
                onClick={() => toggleMany(shownIds)}
                disabled={shownIds.length === 0}
                className="text-sm text-brand-600 hover:text-brand-700 font-semibold disabled:opacity-40"
              >
                {shownIds.length > 0 && shownIds.every((id) => selected.includes(id)) ? "Clear All" : "Select All"}
              </button>
            </div>
            <div className="mb-3">
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email, section or group..."
                  className={inputClassName + " pl-10"}
                />
              </div>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              {offeringId
                ? `Only the students you handle in this ${noun}'s course are listed.`
                : `This ${noun} isn't in a course, so the students you handle in all your courses are listed.`}
            </p>
            <div className="border border-gray-200 rounded-xl max-h-[320px] overflow-x-auto overflow-y-auto custom-scrollbar">
              {roster === null ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
                  <EcgLoader className="text-brand-600" />
                  Loading your students…
                </div>
              ) : rosterError ? (
                <div className="p-4 text-center text-sm text-red-600">{rosterError}</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {query
                    ? "No students match your search"
                    : "No students in this course yet. Students join a course through their section or group."}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600 w-16">Select</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">Name</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-600">Email</th>
                    </tr>
                  </thead>
                  {sections.map(({ section, groups }) => (
                    <tbody key={section} className="border-t-2 border-gray-200 first:border-t-0">
                      {groups.map(([group, list]) => {
                        const groupIds = pickable(list.map((st) => st.id));
                        const groupPicked = groupIds.filter((id) => selected.includes(id)).length;
                        const groupAssigned = list.length - groupIds.length;
                        return [
                          <tr
                            key={`${group}-head`}
                            // Stays under the column headings while its students scroll by.
                            className="sticky top-[37px] z-[5] bg-[color-mix(in_srgb,var(--color-brand-600)_8%,var(--color-surface))] shadow-[0_1px_0_var(--color-gray-200)]"
                          >
                            <td className="py-2 px-4">
                              <input
                                type="checkbox"
                                aria-label={`Select all of ${section} ${group}`}
                                checked={groupIds.length === 0 || groupPicked === groupIds.length}
                                disabled={groupIds.length === 0}
                                title={groupIds.length === 0 ? `Everyone in this group already has this ${noun}` : undefined}
                                ref={(el) => {
                                  if (el) el.indeterminate = groupPicked > 0 && groupPicked < groupIds.length;
                                }}
                                onChange={() => toggleMany(groupIds)}
                                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
                              />
                            </td>
                            <td colSpan={2} className="py-2 px-4">
                              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-brand-600" />
                                <span className="font-bold text-gray-900">{section}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-semibold text-gray-700">{group}</span>
                                <span className="text-xs text-gray-500">
                                  {list.length} student{list.length === 1 ? "" : "s"}
                                  {groupAssigned > 0 ? ` · ${groupAssigned} assigned` : ""}
                                  {groupPicked > 0 ? ` · ${groupPicked} selected` : ""}
                                </span>
                              </span>
                            </td>
                          </tr>,
                          ...list.map((student) => {
                            const assigned = alreadyAssigned.has(student.id);
                            return (
                              <tr
                                key={student.id}
                                className={`border-t border-gray-100 transition-colors ${
                                  assigned
                                    ? "bg-emerald-50/50"
                                    : selected.includes(student.id)
                                      ? "cursor-pointer bg-brand-600/5 hover:bg-brand-600/10"
                                      : "cursor-pointer hover:bg-gray-50"
                                }`}
                                onClick={assigned ? undefined : () => toggle(student.id)}
                              >
                                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                                  {assigned ? (
                                    <FontAwesomeIcon
                                      icon={faCheck}
                                      className="ml-0.5 h-3.5 w-3.5 text-emerald-600"
                                      aria-label="Already assigned"
                                    />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={selected.includes(student.id)}
                                      onChange={() => toggle(student.id)}
                                      className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
                                    />
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-sm text-gray-800">
                                  <div className="flex items-center gap-2">
                                    <Avatar
                                      name={student.name}
                                      src={student.picture_url}
                                      userId={student.id}
                                      sex={sexOf?.(student.id)}
                                      size="xs"
                                    />
                                    {student.name}
                                    {assigned && (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        Assigned
                                      </span>
                                    )}
                                    {student.source === "added" && (
                                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                                        Added by you
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-sm text-gray-500">{student.email}</td>
                              </tr>
                            );
                          }),
                        ];
                      })}
                    </tbody>
                  ))}
                </table>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-2">{count} student(s) selected</p>
          </div>
        </div>

        <div className="p-4 border-t border-hairline bg-subtle">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={count === 0 || !date || assigning}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
            >
              {assigning && <EcgLoader />}
              Assign to {count} Student
              {count !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
