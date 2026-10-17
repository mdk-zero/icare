"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "../lib/api";
import { deadlineFromInput } from "../lib/deadline-input";
import { loadingToast, toast } from "./Toast";

/** One group (or a section's students in no group) and their date of performance. */
export interface PerformanceGroup {
  key: string;
  label: string;
  count: number;
  student_ids: string[];
  deadline: string | null | "mixed";
  /** Graded already. */
  done: number;
}

/** "Oct 16, 2026": a demonstration is performed on a day, so no time. */
export function performDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

const inputClassName =
  "w-full rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-xs text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Who has a patient case or Return Demonstration, by group, with each
 * group's date of performance and a change per group. `endpoint` takes
 * PATCH { student_ids, deadline }; graded students keep their date.
 */
export default function PerformanceDatesModal({
  title,
  studentCount,
  groups,
  endpoint,
  onClose,
  onChanged,
}: {
  title: string;
  studentCount: number;
  groups: PerformanceGroup[];
  endpoint: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newDate, setNewDate] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState<string | null>(null);

  const changeDate = async (group: PerformanceGroup) => {
    const value = newDate[group.key];
    if (!value) return toast("Pick the new date first");
    setMoving(group.key);
    const progress = loadingToast(`Moving ${group.label}'s date…`);
    const res = await apiFetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ student_ids: group.student_ids, deadline: deadlineFromInput(value) }),
    });
    setMoving(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return progress.error(j?.error ?? "Couldn't change the date");
    }
    progress.success(`${group.label} now performs on ${performDate(deadlineFromInput(value))}`);
    onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="who-has-dates-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl shadow-overlay w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-y-auto border border-hairline"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="who-has-dates-title" className="font-semibold text-gray-800">Who has &ldquo;{title}&rdquo;</h3>
            <p className="text-sm text-gray-500">
              {studentCount} student{studentCount === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}.
              Move a group&apos;s date of performance below.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
        <ul className="divide-y divide-hairline rounded-xl border border-hairline">
          {groups.map((g) => (
            <li key={g.key} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{g.label}</p>
                  <p className="text-xs text-gray-500">
                    {g.count} student{g.count === 1 ? "" : "s"} ·{" "}
                    {g.deadline === "mixed" ? "different dates" : g.deadline ? `performs on ${performDate(g.deadline)}` : "no date"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                    g.done === g.count ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {g.done === g.count ? "All graded" : `${g.done} of ${g.count} graded`}
                </span>
              </div>
              {g.done < g.count && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label={`New date of performance for ${g.label}`}
                    value={newDate[g.key] ?? ""}
                    onChange={(e) => setNewDate((prev) => ({ ...prev, [g.key]: e.target.value }))}
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    onClick={() => void changeDate(g)}
                    disabled={!newDate[g.key] || moving !== null}
                    className="shrink-0 rounded-lg border border-brand-600/40 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-50"
                  >
                    {moving === g.key ? "Saving…" : "Change date"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">Students already graded keep their date.</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
