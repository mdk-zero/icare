"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import {
  assignGroupCase,
  fetchFacultyScenarios,
  type FacultyTeam,
  type SimulationScenario,
} from "../../lib/api";
import { deadlineFromInput } from "../../lib/deadline-input";
import { toast } from "../../components/Toast";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Hands a group its case: the faculty member picks one scenario and the whole
 * group gets it. Every member works it and is graded on their own.
 */
export default function AssignCasesModal({
  group,
  onClose,
}: {
  group: FacultyTeam;
  onClose: () => void;
}) {
  const [scenarios, setScenarios] = useState<SimulationScenario[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deadline, setDeadline] = useState("");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchFacultyScenarios().then(setScenarios);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (scenarios ?? []).filter(
      (s) => !q || s.title.toLowerCase().includes(q) || (s.patient_name ?? "").toLowerCase().includes(q),
    );
  }, [scenarios, query]);

  const memberCount = group.members.length;

  const assign = async () => {
    if (!chosen || !deadline) return;
    setBusy(true);
    // A date means the end of that day, here: deadlines decide attendance.
    const result = await assignGroupCase(group.id, { scenario_id: chosen, deadline: deadlineFromInput(deadline) ?? "", required });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast(
      result.skipped.length > 0
        ? `Gave ${plural(result.assigned.length, "member")} of ${group.name} "${result.scenario_title}". ${result.skipped.join(", ")} already had it.`
        : `Gave ${group.name} "${result.scenario_title}"`,
    );
    onClose();
  };

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <header className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Assign a case to {group.name}</h2>
            <p className="text-sm text-gray-500">
              All {plural(memberCount, "member")} get the same case. Each is graded on their own.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-200" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">
              Deadline
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={inputClass + " mt-1"}
              />
            </label>
            <label className="flex items-center gap-3 self-end rounded-xl border border-gray-200 p-2.5 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 rounded text-brand-600"
              />
              Required
            </label>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Case for the group</h3>
            <div className="relative mb-2">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases or patients"
                className={inputClass + " pl-9"}
              />
            </div>
            <ul className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
              {scenarios === null ? (
                <li className="p-4 text-center text-sm text-gray-400">Loading cases…</li>
              ) : shown.length === 0 ? (
                <li className="p-4 text-center text-sm text-gray-400">No cases found.</li>
              ) : (
                shown.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                      <input
                        type="radio"
                        name="group-case"
                        checked={chosen === s.id}
                        onChange={() => {
                          setChosen(s.id);
                          setError(null);
                        }}
                        className="h-4 w-4 text-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{s.title}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {s.patient_name ? `Patient: ${s.patient_name}` : "No patient linked"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-subtle p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={assign}
            disabled={busy || !chosen || !deadline}
            title={!chosen ? "Choose a case first" : deadline ? undefined : "Set a deadline first"}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Assigning…" : `Assign to ${plural(memberCount, "member")}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
