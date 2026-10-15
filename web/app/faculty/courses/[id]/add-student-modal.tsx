"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMagnifyingGlass, faPlus, faUserPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "../../../components/EcgLoader";
import { toast } from "../../../components/Toast";
import { addCourseStudent, searchCourseStudents, type AddableStudent } from "../../../lib/api";

/**
 * Puts a student on the course's roster by hand: an irregular student, or one
 * from a section the course isn't assigned to. Students of the course's
 * sections are already on it, through their group or their section.
 */
export default function AddStudentModal({
  offeringId,
  courseCode,
  onClose,
  onAdded,
}: {
  offeringId: string;
  courseCode: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableStudent[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  // Search as the instructor types, a moment after they pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const result = await searchCourseStudents(offeringId, q);
      if (!live) return;
      setSearching(false);
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      setError(null);
      setResults(result.data.students);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [offeringId, query]);

  const add = async (student: AddableStudent) => {
    setAdding(student.id);
    const result = await addCourseStudent(offeringId, student.id);
    setAdding(null);
    if (result.error !== undefined) {
      toast(result.error, "error");
      return;
    }
    toast(`${student.name} added to ${courseCode}`);
    setResults((prev) => prev?.map((s) => (s.id === student.id ? { ...s, on_roster: true } : s)) ?? null);
    onAdded();
  };

  const shown = query.trim().length >= 2 ? results : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-student-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="add-student-title" className="truncate font-display text-lg font-semibold text-gray-900">
                Add a student to {courseCode}
              </h2>
              <p className="truncate text-sm text-gray-500">For a student outside your groups and sections</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-hairline p-4">
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search students by name or email"
              className="w-full rounded-xl border border-gray-300 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Students in this course&rsquo;s sections are already on your roster, through your groups or their section.
          </p>
        </div>

        <div className="min-h-[8rem] flex-1 overflow-y-auto p-2">
          {error ? (
            <p className="p-4 text-sm text-amber-700">{error}</p>
          ) : shown === null ? (
            <p className="p-6 text-center text-sm text-gray-400">
              {searching ? "Searching…" : "Type at least two letters of a name or email."}
            </p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">No student matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul>
              {shown.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {s.email}
                      {s.section ? ` · ${s.section}` : " · No section"}
                    </p>
                  </div>
                  {s.on_roster ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                      On the roster
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void add(s)}
                      disabled={adding !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                    >
                      {adding === s.id ? <EcgLoader /> : <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />}
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
