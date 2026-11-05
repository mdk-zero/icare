"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faUserPlus, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "../../components/EcgLoader";
import { usePageData } from "../../lib/use-page-data";
import { fetchOfferingStudents, type OfferingRosterStudent } from "../../lib/api";

const SOURCE_LABEL: Record<OfferingRosterStudent["source"], string> = {
  group: "Their group",
  section: "Whole section",
  added: "Added by hand",
};

/**
 * One instructor's students for one course, for the Dean: everyone on their
 * roster for it (their groups, whole sections where they have none, and
 * students added by hand), by section then group, with a search.
 */
export default function RosterModal({
  offeringId,
  courseCode,
  instructorName,
  onClose,
  onAddStudent,
}: {
  offeringId: string;
  courseCode: string;
  instructorName: string;
  onClose: () => void;
  onAddStudent: () => void;
}) {
  const { data, loading } = usePageData(`dean:offering-roster:${offeringId}`, () => fetchOfferingStudents(offeringId));
  const [query, setQuery] = useState("");
  const students = useMemo(() => data?.data?.students ?? [], [data]);
  const error = data?.error;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      : students;
    return [...list].sort(
      (a, b) =>
        a.section.localeCompare(b.section, undefined, { numeric: true }) ||
        a.group.localeCompare(b.group, undefined, { numeric: true }) ||
        a.name.localeCompare(b.name),
    );
  }, [students, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faUsers} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="roster-title" className="truncate font-display text-lg font-semibold text-gray-900">
                {instructorName}&apos;s students
              </h2>
              <p className="truncate text-sm text-gray-500">
                {courseCode}
                {!loading && !error ? ` · ${students.length} ${students.length === 1 ? "student" : "students"}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onAddStudent}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />
              Add student
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="border-b border-hairline p-4">
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search this instructor's students"
              className="w-full rounded-xl border border-gray-300 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            />
          </div>
        </div>

        <div className="min-h-[10rem] flex-1 overflow-y-auto">
          {loading ? (
            <p className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
              <EcgLoader className="text-brand-600" /> Loading the students…
            </p>
          ) : error ? (
            <p className="p-6 text-sm text-amber-700">{error}</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              {query.trim() ? `No student matches "${query.trim()}".` : "No students on this roster yet."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-subtle text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-5 py-2 font-medium">On the roster through</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{s.section}</td>
                    <td className="px-3 py-2.5 text-gray-700">{s.group}</td>
                    <td className="px-5 py-2.5 text-gray-500">{SOURCE_LABEL[s.source]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
