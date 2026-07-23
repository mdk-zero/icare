"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faArrowLeft,
  faSearch,
  faCheck,
  faHospitalUser,
  faTimes,
  faRobot,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyScenarios,
  fetchFacultyPatients,
  updateScenario,
  getCurrentFacultyUser,
  logAuditAction,
  SimulationScenario,
  FacultyPatient,
} from "../../../lib/api";
import PageHeader from "../../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";

export default function LinkPatientsClient() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [patients, setPatients] = useState<FacultyPatient[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [scenarioData, patientData] = await Promise.all([
      fetchFacultyScenarios(),
      fetchFacultyPatients(),
    ]);
    setScenarios(scenarioData);
    setPatients(patientData);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.diagnosis ?? "").toLowerCase().includes(q) ||
        (p.mimic_id ?? "").toLowerCase().includes(q),
    );
  }, [patients, patientSearch]);

  const assignedCount = Object.keys(assignments).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Auto mode: fill the selected scenarios with distinct patients. */
  const autoAssign = () => {
    setError(null);
    if (selectedIds.size === 0) {
      setError("Select at least one scenario.");
      return;
    }
    if (patients.length === 0) {
      setError("No patients available.");
      return;
    }
    const used = new Set<string>();
    const next: Record<string, string> = {};
    for (const scenarioId of scenarios.map((s) => s.id).filter((id) => selectedIds.has(id))) {
      const patient = patients.find((p) => !used.has(p.id));
      if (patient) {
        used.add(patient.id);
        next[scenarioId] = patient.id;
      }
    }
    setAssignments(next);
  };

  /** Manual mode: clicking a patient assigns it to the focused scenario, then
   *  advances focus to the next scenario without an assignment. */
  const assignPatientToActive = (patientId: string) => {
    if (!activeScenarioId) return;
    setAssignments((prev) => ({ ...prev, [activeScenarioId]: patientId }));
    const idx = scenarios.findIndex((s) => s.id === activeScenarioId);
    const nextUnassigned = scenarios
      .slice(idx + 1)
      .find((s) => !assignments[s.id] && s.id !== activeScenarioId);
    setActiveScenarioId(nextUnassigned?.id ?? null);
  };

  const clearAssignment = (id: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleApply = async () => {
    const entries = Object.entries(assignments);
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);

    let linked = 0;
    for (const [scenarioId, patientId] of entries) {
      const updated = await updateScenario(scenarioId, { patient_id: patientId });
      if (updated) linked++;
    }

    if (linked > 0) {
      const faculty = getCurrentFacultyUser();
      if (faculty) {
        logAuditAction({
          faculty_id: faculty.id,
          faculty_name: faculty.name,
          tab: "scenarios",
          action: "bulk_link_scenario_patient",
          details: `Linked patients to ${linked} scenario${linked === 1 ? "" : "s"}`,
          target_type: "scenario",
          target_id: "",
          metadata: { count: linked, mode },
        });
      }
    }

    router.push("/faculty/scenarios");
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHospitalUser} className="w-3.5 h-3.5" />,
          label: "Link Patients",
        }}
        title="Link Patients to Scenarios"
        subtitle="Attach patients to several scenarios at once"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
          Back to scenarios
        </button>
        <div className="inline-flex rounded-xl border border-gray-300 overflow-hidden">
          {(
            [
              ["auto", "Auto-assign"],
              ["manual", "Pick per scenario"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-brand-600 text-white" : "bg-surface text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scenarios table */}
        <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="p-3 border-b border-hairline bg-subtle flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">
              Scenarios{mode === "auto" ? ` · ${selectedIds.size} selected` : ""}
            </span>
            {mode === "auto" && (
              <button
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === scenarios.length
                      ? new Set()
                      : new Set(scenarios.map((s) => s.id)),
                  )
                }
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {selectedIds.size === scenarios.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          <div className="max-h-[440px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center">
                <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-brand-600" />
              </div>
            ) : scenarios.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No scenarios yet.</div>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-hairline">
                  {scenarios.map((scenario) => {
                    const assignedPatient = assignments[scenario.id]
                      ? patientById.get(assignments[scenario.id])
                      : null;
                    const isActive = mode === "manual" && activeScenarioId === scenario.id;
                    const checked = selectedIds.has(scenario.id);
                    return (
                      <tr
                        key={scenario.id}
                        onClick={() =>
                          mode === "auto"
                            ? toggleSelect(scenario.id)
                            : setActiveScenarioId(scenario.id)
                        }
                        className={`cursor-pointer transition-colors ${
                          isActive ? "bg-brand-600/10" : "hover:bg-subtle"
                        }`}
                      >
                        <td className="py-2.5 px-3 w-8">
                          {mode === "auto" ? (
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                checked
                                  ? "bg-brand-600 border-brand-600 text-white"
                                  : "border-gray-300"
                              }`}
                            >
                              {checked && <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />}
                            </span>
                          ) : (
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                isActive ? "border-brand-600 text-brand-600" : "border-gray-300"
                              }`}
                            >
                              {isActive && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {scenario.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {scenario.patient_name
                              ? `Currently: ${scenario.patient_name}`
                              : "No linked patient"}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {assignedPatient ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700 px-2.5 py-1 text-xs font-medium">
                              {assignedPatient.name}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearAssignment(scenario.id);
                                }}
                                className="hover:text-brand-900"
                              >
                                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                              </button>
                            </span>
                          ) : mode === "manual" && isActive ? (
                            <span className="text-xs text-brand-600">pick a patient →</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: auto action, or patient table */}
        {mode === "auto" ? (
          <div className="rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-2">
              <FontAwesomeIcon icon={faRobot} className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold text-gray-800">Auto-assign</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Assigns a distinct patient to each selected scenario, in order. Review the assignments
              on the left, then apply.
            </p>
            <button
              onClick={autoAssign}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg transition-all hover:bg-brand-700 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faHospitalUser} className="w-4 h-4" />
              Assign distinct patients to {selectedIds.size} selected
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="p-3 border-b border-hairline bg-subtle">
              <div className="text-sm font-bold text-gray-800 mb-2">
                Patients
                {activeScenarioId ? (
                  <span className="font-normal text-gray-500"> — click one to assign</span>
                ) : (
                  <span className="font-normal text-gray-500"> — select a scenario first</span>
                )}
              </div>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faSearch}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search name, diagnosis, MIMIC ID..."
                  className={inputClassName + " pl-10"}
                />
              </div>
            </div>
            <div className="max-h-[368px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center">
                  <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-brand-600" />
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No patients match.</div>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-hairline">
                    {filteredPatients.map((patient) => (
                      <tr
                        key={patient.id}
                        onClick={() => assignPatientToActive(patient.id)}
                        className={`transition-colors ${
                          activeScenarioId
                            ? "cursor-pointer hover:bg-subtle"
                            : "opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {patient.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {patient.diagnosis} · <span className="font-mono">{patient.mimic_id}</span>
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Apply bar */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <span className="text-sm text-gray-500 mr-auto">
          {assignedCount} scenario{assignedCount === 1 ? "" : "s"} ready to link
        </span>
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={saving || assignedCount === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
        >
          {saving && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
          Link {assignedCount > 0 ? assignedCount : ""}
        </button>
      </div>
    </div>
  );
}
