"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faSpinner,
  faArrowLeft,
  faSearch,
  faCheck,
  faSave,
  faChevronDown,
  faDoorOpen,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchScenarioById,
  updateScenario,
  fetchFacultyPatients,
  fetchRooms,
  updateFacultyPatient,
  getCurrentFacultyUser,
  logAuditAction,
  FacultyPatient,
  Room,
  SimulationScenario,
} from "../../../../lib/api";
import { roomStatus, ROOM_STATUS_LABEL, ROOM_STATUS_TONE } from "../../../../lib/rooms";
import { toast } from "../../../../components/Toast";
import PageHeader from "../../../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";

const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

const selectClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm appearance-none shadow-sm cursor-pointer";

const SCENARIO_CATEGORIES = [
  "Cardiac Emergency",
  "Respiratory Emergency",
  "Neurological Emergency",
  "Trauma",
  "Medical-Surgical",
  "Patient Education",
  "Infection Management",
  "Critical Care",
  "Medication Safety",
  "General",
] as const;

const emptyForm = {
  title: "",
  description: "",
  difficulty: "intermediate" as "beginner" | "intermediate" | "advanced",
  category: "",
  learningObjectives: "",
  patientId: "",
  roomId: "",
};

export default function EditScenarioClient({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [patients, setPatients] = useState<FacultyPatient[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [customCategory, setCustomCategory] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [scenarioData, patientData, roomData] = await Promise.all([
      fetchScenarioById(scenarioId),
      fetchFacultyPatients(),
      fetchRooms(),
    ]);
    setPatients(patientData);
    setRooms(roomData);

    if (!scenarioData) {
      setNotFound(true);
      setLoadingData(false);
      return;
    }

    setScenario(scenarioData);
    const linked = patientData.find((p) => p.id === (scenarioData.patient_id ?? ""));
    setForm({
      title: scenarioData.title,
      description: scenarioData.description ?? "",
      difficulty: scenarioData.difficulty as typeof emptyForm.difficulty,
      category: scenarioData.category ?? "",
      learningObjectives: (scenarioData.learning_objectives ?? []).join("\n"),
      patientId: scenarioData.patient_id ?? "",
      // Where the linked patient already is, so leaving the room table alone
      // keeps them there.
      roomId: linked?.room_id ?? "",
    });
    // A category off the preset list — an AI draft or one typed by hand — has
    // to stay editable as free text, or saving would silently rewrite it.
    const cat = scenarioData.category ?? "";
    if (cat && !SCENARIO_CATEGORIES.includes(cat as (typeof SCENARIO_CATEGORIES)[number])) {
      setCustomCategory(true);
    }
    setLoadingData(false);
  }, [scenarioId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const occupancyByRoom = useMemo(() => {
    const tally = new Map<string, number>();
    for (const p of patients) if (p.room_id) tally.set(p.room_id, (tally.get(p.room_id) ?? 0) + 1);
    return tally;
  }, [patients]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === form.patientId) ?? null,
    [patients, form.patientId],
  );

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.diagnosis ?? "").toLowerCase().includes(q) ||
        (p.mimic_id ?? "").toLowerCase().includes(q) ||
        (p.room_number ?? "").toLowerCase().includes(q),
    );
  }, [patients, patientSearch]);

  /** Selecting a patient defaults the room to wherever they already are. */
  const selectPatient = (patientId: string) => {
    const picked = patients.find((p) => p.id === patientId);
    setForm((prev) => ({ ...prev, patientId, roomId: picked?.room_id ?? "" }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const updated = await updateScenario(scenarioId, {
      title: form.title,
      description: form.description,
      difficulty: form.difficulty,
      category: form.category || "General",
      patient_id: form.patientId || null,
      learning_objectives: form.learningObjectives
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
    });

    if (!updated) {
      // The API lets only the scenario's creator (or an admin) through, so a
      // refusal is worth naming rather than closing over.
      setError("Unable to save the scenario. You can only edit scenarios you created.");
      setSaving(false);
      return;
    }

    const faculty = getCurrentFacultyUser();
    if (faculty) {
      logAuditAction({
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        tab: "scenarios",
        action: "update_scenario",
        details: `Updated scenario: ${updated.title}`,
        target_type: "scenario",
        target_id: scenarioId,
        metadata: { scenario_title: updated.title },
      });
    }

    // Apply the chosen room to the linked patient (capacity-enforced by the API).
    if (
      form.patientId &&
      form.roomId &&
      selectedPatient &&
      selectedPatient.room_id !== form.roomId
    ) {
      const res = await updateFacultyPatient(form.patientId, {
        name: selectedPatient.name,
        age: selectedPatient.age,
        gender: selectedPatient.gender,
        diagnosis: selectedPatient.diagnosis,
        admission_date: selectedPatient.admission_date,
        vital_signs: selectedPatient.vital_signs,
        labs: selectedPatient.labs,
        room_id: form.roomId,
      });
      if (res.error) console.error("Room assignment failed:", res.error);
    }

    toast("Scenario updated");
    router.push("/faculty/scenarios");
  };

  if (loadingData) {
    return (
      <div>
        <PageHeader
          badge={{
            icon: <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5" />,
            label: "Edit Scenario",
          }}
          title="Edit Scenario"
          subtitle="Loading the scenario…"
        />
        <div className="p-12 text-center">
          <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-brand-600" />
        </div>
      </div>
    );
  }

  if (notFound || !scenario) {
    return (
      <div>
        <PageHeader
          badge={{
            icon: <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5" />,
            label: "Edit Scenario",
          }}
          title="Scenario not found"
          subtitle="It may have been deleted by someone else."
        />
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
          Back to scenarios
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5" />,
          label: "Edit Scenario",
        }}
        title={scenario.title}
        subtitle="Change the case details, the patient it runs on, and where that patient sits"
      />

      <button
        onClick={() => router.push("/faculty/scenarios")}
        className="mb-4 inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
        Back to scenarios
      </button>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: details */}
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-surface p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div>
              <label className={labelClassName}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Acute MI Response"
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Brief overview of the scenario..."
                className={inputClassName + " resize-none"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClassName}>Difficulty</label>
                <div className="relative">
                  <select
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm({ ...form, difficulty: e.target.value as typeof form.difficulty })
                    }
                    className={selectClassName + " pr-10"}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                  />
                </div>
              </div>
              <div>
                <label className={labelClassName}>Category</label>
                {customCategory ? (
                  <div>
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="New category name"
                      maxLength={60}
                      className={inputClassName}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCategory(false);
                        setForm((f) => ({ ...f, category: "" }));
                      }}
                      className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Choose from a preset instead
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setCustomCategory(true);
                          setForm((f) => ({ ...f, category: "" }));
                        } else {
                          setForm({ ...form, category: e.target.value });
                        }
                      }}
                      className={selectClassName + " pr-10"}
                    >
                      <option value="">Select category</option>
                      {SCENARIO_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__new__">➕ Create new category…</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className={labelClassName}>Learning Objectives</label>
              <textarea
                value={form.learningObjectives}
                onChange={(e) => setForm({ ...form, learningObjectives: e.target.value })}
                rows={4}
                placeholder="One objective per line&#10;e.g. Recognize signs of acute MI"
                className={inputClassName + " resize-none"}
              />
              <p className="text-xs text-gray-500 mt-1.5">Enter one objective per line.</p>
            </div>
          </div>
        </div>

        {/* Right: patient + room tables */}
        <div className="space-y-4">
          {/* Patient table */}
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="p-3 border-b border-hairline bg-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800">Patient</span>
                {form.patientId ? (
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, patientId: "", roomId: "" }))}
                    className="text-xs font-medium text-brand-700 hover:text-brand-900"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">No patient linked</span>
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
                  placeholder="Search name, diagnosis, MIMIC ID, or room..."
                  className={inputClassName + " pl-10"}
                />
              </div>
            </div>
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              {filteredPatients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No patients match.</div>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-hairline">
                    {filteredPatients.map((patient) => {
                      const selected = form.patientId === patient.id;
                      return (
                        <tr
                          key={patient.id}
                          onClick={() => selectPatient(patient.id)}
                          className={`cursor-pointer transition-colors ${
                            selected ? "bg-brand-600/5" : "hover:bg-subtle"
                          }`}
                        >
                          <td className="py-2.5 px-3 w-8">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                selected
                                  ? "bg-brand-600 border-brand-600 text-white"
                                  : "border-gray-300"
                              }`}
                            >
                              {selected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {patient.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {patient.diagnosis} · <span className="font-mono">{patient.mimic_id}</span>
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-xs text-gray-500">
                              {patient.room?.name ? `Room ${patient.room.room_number}` : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Room table */}
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="p-3 border-b border-hairline bg-subtle flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Room</span>
              {form.roomId && (
                <button
                  onClick={() => setForm((prev) => ({ ...prev, roomId: "" }))}
                  className="text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  Clear
                </button>
              )}
            </div>
            {!form.patientId ? (
              <div className="p-6 text-center text-sm text-gray-500">
                Select a patient first to assign a room.
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                <table className="w-full">
                  <tbody className="divide-y divide-hairline">
                    {rooms.map((room) => {
                      const occ = occupancyByRoom.get(room.id) ?? 0;
                      const isCurrent = selectedPatient?.room_id === room.id;
                      const status = roomStatus(occ, room.capacity);
                      const disabled = status === "full" && !isCurrent;
                      const selected = form.roomId === room.id;
                      return (
                        <tr
                          key={room.id}
                          onClick={() =>
                            !disabled && setForm((prev) => ({ ...prev, roomId: room.id }))
                          }
                          className={`transition-colors ${
                            disabled
                              ? "opacity-50 cursor-not-allowed"
                              : selected
                                ? "bg-brand-600/5 cursor-pointer"
                                : "hover:bg-subtle cursor-pointer"
                          }`}
                        >
                          <td className="py-2.5 px-3 w-8">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                selected
                                  ? "bg-brand-600 border-brand-600 text-white"
                                  : "border-gray-300"
                              }`}
                            >
                              {selected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-2">
                              <FontAwesomeIcon icon={faDoorOpen} className="w-3.5 h-3.5 text-gray-400" />
                              {room.name}
                            </p>
                            <p className="text-xs text-gray-500">Room {room.room_number}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className="text-xs text-gray-500 tabular-nums mr-2">
                              {occ}/{room.capacity}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROOM_STATUS_TONE[status]}`}
                            >
                              {ROOM_STATUS_LABEL[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.title.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
        >
          {saving ? (
            <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
          ) : (
            <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
          )}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {rooms.length === 0 && (
        <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3" />
          No rooms exist yet — create them in Admin → Rooms.
        </p>
      )}
    </div>
  );
}
