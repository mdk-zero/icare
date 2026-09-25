"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faShuffle, faTimes } from "@fortawesome/free-solid-svg-icons";
import {
  assignGroupCases,
  fetchFacultyScenarios,
  type FacultyTeam,
  type GroupCasePlan,
  type SimulationScenario,
} from "../../lib/api";
import { toast } from "../../components/Toast";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Hands a group its cases: the faculty member picks a pool of scenarios, sees
 * who would get which (every member a different case and patient, never one
 * they already had), then confirms. Each member is still graded on their own.
 */
export default function AssignCasesModal({
  group,
  onClose,
}: {
  group: FacultyTeam;
  onClose: () => void;
}) {
  const [scenarios, setScenarios] = useState<SimulationScenario[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [deadline, setDeadline] = useState("");
  const [required, setRequired] = useState(true);
  const [plan, setPlan] = useState<GroupCasePlan[] | null>(null);
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

  const needed = group.members.length;
  const toggle = (id: string) => {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // Any change to the pool makes the shown split stale.
    setPlan(null);
    setError(null);
  };

  const preview = async () => {
    setBusy(true);
    const result = await assignGroupCases(group.id, { scenario_ids: chosen, preview: true });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      setPlan(null);
    } else {
      setError(null);
      setPlan(result.plan);
    }
  };

  const confirm = async () => {
    if (!plan || !deadline) return;
    setBusy(true);
    const result = await assignGroupCases(group.id, { scenario_ids: chosen, deadline, required });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast(`Gave ${group.name} ${plural(result.plan.length, "case")}, one per member`);
    onClose();
  };

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <header className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Assign cases to {group.name}</h2>
            <p className="text-sm text-gray-500">
              Each of the {plural(needed, "member")} gets a different case and patient, graded on their own.
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
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-gray-900">Cases to hand out</h3>
              <span className={`text-xs ${chosen.length >= needed ? "text-gray-500" : "text-amber-700"}`}>
                {chosen.length} chosen, at least {needed} needed
              </span>
            </div>
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
                        type="checkbox"
                        checked={chosen.includes(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded text-brand-600"
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

          {plan && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-gray-900">Who gets what</h3>
              <table className="w-full overflow-hidden rounded-xl border border-hairline text-sm">
                <thead className="bg-subtle text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Patient</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {plan.map((p) => (
                    <tr key={p.student_id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{p.student_name}</td>
                      <td className="px-3 py-2 text-gray-700">{p.scenario_title}</td>
                      <td className="px-3 py-2 text-gray-500">{p.patient_name ?? "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-subtle p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          {plan ? (
            <button
              onClick={confirm}
              disabled={busy || !deadline}
              title={deadline ? undefined : "Set a deadline first"}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Assigning…" : "Assign these cases"}
            </button>
          ) : (
            <button
              onClick={preview}
              disabled={busy || chosen.length < needed}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faShuffle} className="h-3.5 w-3.5" />
              {busy ? "Working…" : "Preview the split"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
