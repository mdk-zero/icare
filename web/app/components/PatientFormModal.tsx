"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faDice,
  faFlask,
  faHeartPulse,
  faPen,
  faPlus,
  faSave,
  faStethoscope,
  faTimes,
  faBookMedical,
} from "@fortawesome/free-solid-svg-icons";
import {
  createFacultyPatient,
  updateFacultyPatient,
  type FacultyPatient,
  type PatientCourseOption,
  type Room,
} from "../lib/api";
import { PATIENT_PRESETS, PRESET_GROUPS, presetVitals } from "../lib/patient-presets";
import { roomStatus } from "../lib/rooms";
import { EcgLoader } from "./EcgLoader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";
const vitalLabelClassName = "block text-xs font-bold text-gray-700 mb-1.5";

interface PatientForm {
  name: string;
  age: string;
  gender: string;
  room_id: string;
  diagnosis: string;
  admission_date: string;
  vital_signs: {
    heart_rate: string;
    blood_pressure: string;
    temperature: string;
    respiratory_rate: string;
    oxygen_saturation: string;
  };
  labs: Record<string, string | number | null>;
  course_ids: string[];
}

/** "2026-10-09T11:16" in the browser's own time, as datetime-local wants. */
function localNow(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function blankForm(roomId: string, courses: PatientCourseOption[]): PatientForm {
  return {
    name: "",
    age: "",
    gender: "",
    room_id: roomId,
    diagnosis: "",
    admission_date: localNow(),
    vital_signs: { heart_rate: "", blood_pressure: "", temperature: "", respiratory_rate: "", oxygen_saturation: "" },
    labs: {},
    // With a single course there is nothing to choose.
    course_ids: courses.length === 1 ? [courses[0].id] : [],
  };
}

function formFromPatient(patient: FacultyPatient): PatientForm {
  return {
    name: patient.name,
    age: String(patient.age ?? ""),
    gender: patient.gender,
    room_id: patient.room_id ?? "",
    diagnosis: patient.diagnosis,
    admission_date: patient.admission_date ? localNow(new Date(patient.admission_date)) : localNow(),
    vital_signs: {
      heart_rate: patient.vital_signs?.heart_rate?.toString() ?? "",
      blood_pressure: patient.vital_signs?.blood_pressure ?? "",
      temperature: patient.vital_signs?.temperature?.toString() ?? "",
      respiratory_rate: patient.vital_signs?.respiratory_rate?.toString() ?? "",
      oxygen_saturation: patient.vital_signs?.oxygen_saturation?.toString() ?? "",
    },
    labs: patient.labs || {},
    course_ids: patient.course_ids ?? [],
  };
}

const FIRST_NAMES = {
  M: ["Juan", "Jose", "Mark", "Paolo", "Rafael", "Miguel", "Andres", "Carlo", "Emilio", "Ramon", "Lorenzo", "Nestor"],
  F: ["Maria", "Ana", "Kristine", "Liza", "Joana", "Carmela", "Rosa", "Teresa", "Angelica", "Nina", "Patricia", "Luz"],
};
const SURNAMES = [
  "Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza", "Villanueva", "Ramos",
  "Aquino", "Castillo", "Navarro", "Salazar", "Fontanilla", "Ilagan", "Macaraeg", "Soriano",
];
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

interface PatientFormModalProps {
  /** null to add a new patient. */
  patient: FacultyPatient | null;
  rooms: Room[];
  /** Courses the viewer can file the patient under. */
  courses: PatientCourseOption[];
  /** False before migration 069: no course picker. */
  coursesEnabled: boolean;
  /** Preselected room for a new patient. */
  initialRoomId?: string;
  /** Preselected courses for a new patient, e.g. the course a case is being made for. */
  initialCourseIds?: string[];
  onClose: () => void;
  onSaved: (patient: FacultyPatient, created: boolean) => void;
}

/**
 * Adding or editing a simulated patient. A new patient can start from a
 * common condition, which fills the diagnosis, vital signs and labs; every
 * field stays editable. A patient is filed under one or more of the
 * viewer's courses, which decides which instructors can see it.
 */
export default function PatientFormModal({
  patient,
  rooms,
  courses,
  coursesEnabled,
  initialRoomId = "",
  initialCourseIds,
  onClose,
  onSaved,
}: PatientFormModalProps) {
  const editing = !!patient;
  const discharged = patient?.status === "discharged";
  const [form, setForm] = useState<PatientForm>(() =>
    patient
      ? formFromPatient(patient)
      : {
          ...blankForm(initialRoomId, courses),
          ...(initialCourseIds?.length ? { course_ids: initialCourseIds } : {}),
        },
  );
  const [presetId, setPresetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PATIENT_PRESETS.find((p) => p.id === presetId) ?? null;
  const labEntries = Object.entries(form.labs).filter(([, v]) => v !== null && v !== "");
  // Courses already on the patient that the viewer doesn't handle stay on
  // it; they are shown so the viewer knows the patient is shared.
  const courseIds = new Set(courses.map((c) => c.id));
  const otherCourses = (patient?.course_ids ?? []).filter((id) => !courseIds.has(id)).length;

  const presetsByGroup = useMemo(
    () => PRESET_GROUPS.map((group) => ({ group, presets: PATIENT_PRESETS.filter((p) => p.group === group) })),
    [],
  );

  const setField = (field: Exclude<keyof PatientForm, "vital_signs" | "labs" | "course_ids">, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));
  const setVital = (field: keyof PatientForm["vital_signs"], value: string) =>
    setForm((prev) => ({ ...prev, vital_signs: { ...prev.vital_signs, [field]: value } }));

  const applyPreset = (id: string) => {
    setPresetId(id);
    const chosen = PATIENT_PRESETS.find((p) => p.id === id);
    if (!chosen) return;
    const v = presetVitals(chosen);
    setForm((prev) => ({
      ...prev,
      diagnosis: chosen.diagnosis,
      vital_signs: {
        heart_rate: String(v.heart_rate),
        blood_pressure: v.blood_pressure,
        temperature: String(v.temperature),
        respiratory_rate: String(v.respiratory_rate),
        oxygen_saturation: String(v.oxygen_saturation),
      },
      labs: { ...chosen.labs },
    }));
  };

  const randomName = () => {
    const sex = form.gender === "M" || form.gender === "F" ? form.gender : pick(["M", "F"] as const);
    setForm((prev) => ({
      ...prev,
      name: `${pick(FIRST_NAMES[sex])} ${pick(SURNAMES)}`,
      gender: sex,
      age: prev.age || String(18 + Math.floor(Math.random() * 60)),
    }));
  };

  const toggleCourse = (id: string) =>
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(id) ? prev.course_ids.filter((c) => c !== id) : [...prev.course_ids, id],
    }));

  const ownCourseIds = form.course_ids.filter((id) => courseIds.has(id));
  const needsCourse = coursesEnabled && ownCourseIds.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (coursesEnabled && courses.length === 0) {
      setError("You have no assigned courses yet. Ask your Dean to assign you a course before adding patients.");
      return;
    }
    if (needsCourse) {
      setError("Choose at least one course for this patient.");
      return;
    }
    setSaving(true);
    setError(null);
    const vs = form.vital_signs;
    const payload = {
      name: form.name,
      age: parseInt(form.age, 10),
      gender: form.gender,
      // The server derives and stores the room_number label from this link.
      room_id: form.room_id || null,
      diagnosis: form.diagnosis,
      admission_date: new Date(form.admission_date).toISOString(),
      vital_signs: {
        heart_rate: vs.heart_rate ? Number(vs.heart_rate) : null,
        blood_pressure: vs.blood_pressure || null,
        temperature: vs.temperature ? Number(vs.temperature) : null,
        respiratory_rate: vs.respiratory_rate ? Number(vs.respiratory_rate) : null,
        oxygen_saturation: vs.oxygen_saturation ? Number(vs.oxygen_saturation) : null,
      },
      labs: form.labs,
      ...(coursesEnabled ? { course_ids: ownCourseIds } : {}),
    };
    const result = patient ? await updateFacultyPatient(patient.id, payload) : await createFacultyPatient(payload);
    setSaving(false);
    if (result.error || !result.patient) {
      setError(result.error ?? "Unable to save the patient. Please try again.");
      return;
    }
    onSaved(result.patient, !patient);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-hairline">
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={editing ? faPen : faPlus} className="text-brand-600 w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{editing ? "Edit Patient" : "Add Patient"}</h2>
              <p className="text-sm text-gray-500">
                {editing ? "Update patient record" : "Pick a condition and the chart fills itself"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <form onSubmit={handleSubmit} className="p-4 space-y-5">
            {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

            {/* Condition preset */}
            <div className="rounded-xl border border-brand-600/25 bg-brand-600/[0.04] p-4">
              <label htmlFor="patient-preset" className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <FontAwesomeIcon icon={faStethoscope} className="h-4 w-4 text-brand-600" />
                {editing ? "Replace with a condition" : "Condition"}
                <span className="text-xs font-medium text-gray-500">fills the diagnosis, vital signs and labs</span>
              </label>
              <select
                id="patient-preset"
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
                className={`${inputClassName} mt-2`}
              >
                <option value="">Select a condition…</option>
                {presetsByGroup.map(({ group, presets }) => (
                  <optgroup key={group} label={group}>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {preset && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-700">
                  <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                  Filled from “{preset.label}”. Every field below can still be changed.
                </p>
              )}
            </div>

            {/* Courses */}
            {coursesEnabled && (
              <div>
                <p className={`${labelClassName} flex items-center gap-2`}>
                  <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5 text-brand-600" />
                  Course
                  <span className="text-xs font-medium text-gray-500">
                    instructors of these courses can see this patient
                  </span>
                </p>
                {courses.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    You have no assigned courses yet. Ask your Dean to assign you a course.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Courses">
                    {courses.map((c) => {
                      const on = form.course_ids.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCourse(c.id)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                            on
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-gray-300 bg-surface text-gray-700 hover:border-brand-600/50"
                          }`}
                        >
                          {on && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                          <span className="font-semibold">{c.code}</span>
                          <span className={on ? "text-white/80" : "text-gray-500"}>{c.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {otherCourses > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Also in {otherCourses} course{otherCourses === 1 ? "" : "s"} you don&apos;t handle; those stay as they are.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="patient-name" className="text-sm font-bold text-gray-800">
                    Full Name
                  </label>
                  <button
                    type="button"
                    onClick={randomName}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
                  >
                    <FontAwesomeIcon icon={faDice} className="h-3 w-3" />
                    Random name
                  </button>
                </div>
                <input
                  id="patient-name"
                  required
                  type="text"
                  placeholder="e.g. Juan Dela Cruz"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <label htmlFor="patient-gender" className={labelClassName}>
                  Gender
                </label>
                <select
                  id="patient-gender"
                  required
                  value={form.gender}
                  onChange={(e) => setField("gender", e.target.value)}
                  className={inputClassName}
                >
                  <option value="">Select gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="U">Unknown</option>
                </select>
              </div>
              <div>
                <label htmlFor="patient-age" className={labelClassName}>
                  Age
                </label>
                <input
                  id="patient-age"
                  required
                  type="number"
                  min={0}
                  max={150}
                  placeholder="e.g. 35"
                  value={form.age}
                  onChange={(e) => setField("age", e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <label htmlFor="patient-room" className={labelClassName}>
                  Room
                </label>
                <select
                  id="patient-room"
                  value={form.room_id}
                  onChange={(e) => setField("room_id", e.target.value)}
                  className={inputClassName}
                  // The server refuses a room on a discharged patient anyway;
                  // disabling here says why instead of failing the save.
                  disabled={discharged}
                >
                  <option value="">No room assigned</option>
                  {rooms.map((room) => {
                    const isCurrent = patient?.room_id === room.id;
                    const full = roomStatus(room.patients_assigned, room.capacity) === "full";
                    return (
                      <option key={room.id} value={room.id} disabled={full && !isCurrent}>
                        {`${room.name} · Room ${room.room_number} (${room.patients_assigned}/${room.capacity})${full ? " — Full" : ""}`}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">
                  {discharged
                    ? "Discharged — check the patient in to assign a room."
                    : "Links the patient to a room in the system. Full rooms can't be selected."}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="patient-diagnosis" className={labelClassName}>
                  Diagnosis
                </label>
                <input
                  id="patient-diagnosis"
                  required
                  type="text"
                  placeholder="e.g. Community-acquired pneumonia"
                  value={form.diagnosis}
                  onChange={(e) => setField("diagnosis", e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="patient-admission" className={labelClassName}>
                  Admission Date
                </label>
                <input
                  id="patient-admission"
                  required
                  type="datetime-local"
                  value={form.admission_date}
                  onChange={(e) => setField("admission_date", e.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FontAwesomeIcon icon={faHeartPulse} className="w-4 h-4 text-red-500" />
                Vital Signs
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="vs-hr" className={vitalLabelClassName}>Heart Rate (bpm)</label>
                  <input id="vs-hr" type="number" placeholder="e.g. 72" value={form.vital_signs.heart_rate} onChange={(e) => setVital("heart_rate", e.target.value)} className={inputClassName} />
                </div>
                <div>
                  <label htmlFor="vs-bp" className={vitalLabelClassName}>Blood Pressure</label>
                  <input id="vs-bp" type="text" placeholder="e.g. 120/80" value={form.vital_signs.blood_pressure} onChange={(e) => setVital("blood_pressure", e.target.value)} className={inputClassName} />
                </div>
                <div>
                  <label htmlFor="vs-temp" className={vitalLabelClassName}>Temperature (°C)</label>
                  <input id="vs-temp" type="number" step="0.1" placeholder="e.g. 37.0" value={form.vital_signs.temperature} onChange={(e) => setVital("temperature", e.target.value)} className={inputClassName} />
                </div>
                <div>
                  <label htmlFor="vs-rr" className={vitalLabelClassName}>Respiratory Rate</label>
                  <input id="vs-rr" type="number" placeholder="e.g. 16" value={form.vital_signs.respiratory_rate} onChange={(e) => setVital("respiratory_rate", e.target.value)} className={inputClassName} />
                </div>
                <div>
                  <label htmlFor="vs-spo2" className={vitalLabelClassName}>SpO2 (%)</label>
                  <input id="vs-spo2" type="number" min={0} max={100} placeholder="e.g. 98" value={form.vital_signs.oxygen_saturation} onChange={(e) => setVital("oxygen_saturation", e.target.value)} className={inputClassName} />
                </div>
              </div>
            </div>

            {labEntries.length > 0 && (
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faFlask} className="w-4 h-4 text-violet-500" />
                  Labs
                  {preset && <span className="text-xs font-medium text-gray-500">typical for this condition</span>}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {labEntries.map(([name, value]) => (
                    <span key={name} className="rounded-lg border border-hairline bg-subtle px-2.5 py-1.5 text-xs text-gray-700">
                      {name} <span className="font-semibold text-gray-900">{value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-hairline">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-[#145a68] disabled:opacity-60 text-white font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
              >
                {saving && <EcgLoader />}
                <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                {editing ? (saving ? "Saving..." : "Save Changes") : saving ? "Admitting..." : "Admit Patient"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
