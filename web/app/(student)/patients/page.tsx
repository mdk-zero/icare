"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faFilter,
  faSpinner,
  faHeartbeat,
  faLungs,
  faThermometerHalf,
  faTint,
  faExclamationTriangle,
  faCheckCircle,
  faHospitalUser,
  faNotesMedical,
  faUser,
  faCalendarDay,
  faVial,
  faTimes,
  faEye,
  faPen,
  faHistory,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchPatients,
  fetchMyVitalReadings,
  submitVitalReading,
  Patient,
  VitalReading,
  AnomalyReason,
} from "../../lib/api";
import EhrModal from "./ehr-modal";

interface CleanedPatient extends Patient {
  displayGender: string;
  displayAge: number;
  dataQuality: {
    status: "good" | "fair" | "poor";
    label: string;
    missingFields: string[];
  };
  vitalStatus: {
    heart_rate: ReturnType<typeof getVitalStatus>;
    temperature: ReturnType<typeof getVitalStatus>;
    respiratory_rate: ReturnType<typeof getVitalStatus>;
    oxygen_saturation: ReturnType<typeof getVitalStatus>;
  };
  hasAbnormalVitals: boolean;
}

const VITAL_RANGES = {
  heart_rate: { min: 60, max: 100, label: "bpm" },
  temperature: { min: 36.1, max: 37.2, label: "°C" },
  respiratory_rate: { min: 12, max: 20, label: "/min" },
  oxygen_saturation: { min: 95, max: 100, label: "%" },
};

function getVitalStatus(
  value: number | null | undefined,
  type: keyof typeof VITAL_RANGES
): { status: "normal" | "low" | "high" | "missing"; color: string } {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { status: "missing", color: "text-gray-400" };
  }

  const range = VITAL_RANGES[type];
  if (!range) return { status: "normal", color: "text-emerald-600" };

  if (value < range.min) return { status: "low", color: "text-amber-600" };
  if (value > range.max) return { status: "high", color: "text-rose-600" };
  return { status: "normal", color: "text-emerald-600" };
}

function normalizeGender(gender: string | undefined): string {
  const g = (gender || "").trim().toUpperCase();
  if (g === "M" || g === "MALE") return "Male";
  if (g === "F" || g === "FEMALE") return "Female";
  return "Unknown";
}

function clampAge(age: number | undefined): number {
  if (age === undefined || age === null || Number.isNaN(age)) return 0;
  return Math.max(0, Math.min(120, Math.round(age)));
}

function clampSpO2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanPatient(patient: Patient): CleanedPatient {
  const cleaned: CleanedPatient = {
    ...patient,
    displayGender: normalizeGender(patient.gender),
    displayAge: clampAge(patient.age),
    vital_signs: {
      ...patient.vital_signs,
      oxygen_saturation: clampSpO2(patient.vital_signs.oxygen_saturation),
    },
    dataQuality: { status: "good", label: "Complete", missingFields: [] },
    vitalStatus: {
      heart_rate: getVitalStatus(patient.vital_signs.heart_rate, "heart_rate"),
      temperature: getVitalStatus(patient.vital_signs.temperature, "temperature"),
      respiratory_rate: getVitalStatus(
        patient.vital_signs.respiratory_rate,
        "respiratory_rate"
      ),
      oxygen_saturation: getVitalStatus(
        patient.vital_signs.oxygen_saturation,
        "oxygen_saturation"
      ),
    },
    hasAbnormalVitals: false,
  };

  const missingFields: string[] = [];
  if (!patient.name?.trim()) missingFields.push("name");
  if (!patient.diagnosis?.trim()) missingFields.push("diagnosis");
  if (!patient.room_number?.trim()) missingFields.push("room");

  const vitalKeys: (keyof typeof VITAL_RANGES)[] = [
    "heart_rate",
    "temperature",
    "respiratory_rate",
    "oxygen_saturation",
  ];
  for (const key of vitalKeys) {
    if (cleaned.vitalStatus[key].status === "missing") {
      missingFields.push(key.replace(/_/g, " "));
    }
  }

  cleaned.hasAbnormalVitals = vitalKeys.some(
    (key) => cleaned.vitalStatus[key].status === "low" || cleaned.vitalStatus[key].status === "high"
  );

  if (missingFields.length === 0) {
    cleaned.dataQuality = { status: "good", label: "Complete", missingFields };
  } else if (missingFields.length <= 2) {
    cleaned.dataQuality = { status: "fair", label: "Partial", missingFields };
  } else {
    cleaned.dataQuality = { status: "poor", label: "Incomplete", missingFields };
  }

  return cleaned;
}

function formatVital(
  value: number | string | null | undefined,
  unit: string,
  fallback = "—"
): string {
  if (value === null || value === undefined || value === "") return fallback;
  return `${value}${unit}`;
}

export default function StudentPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<CleanedPatient | null>(null);
  const [encodingPatient, setEncodingPatient] = useState<CleanedPatient | null>(null);
  const [ehrPatient, setEhrPatient] = useState<CleanedPatient | null>(null);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    const data = await fetchPatients(searchQuery, abnormalOnly);
    setPatients(data);
    setLoading(false);
  }, [searchQuery, abnormalOnly]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadPatients();
    }, 300);
    return () => clearTimeout(timeout);
  }, [loadPatients]);

  const cleanedPatients = useMemo(() => patients.map(cleanPatient), [patients]);

  const abnormalCount = cleanedPatients.filter((p) => p.hasAbnormalVitals).length;
  const incompleteCount = cleanedPatients.filter((p) => p.dataQuality.status !== "good").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <FontAwesomeIcon icon={faHospitalUser} className="text-[#1B6B7B]" />
          Patient Records
        </h1>
        <p className="text-gray-500">
          Simulated EHR data from MIMIC-IV, cleaned and validated for training
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faHospitalUser} className="w-5 h-5 text-[#1B6B7B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{cleanedPatients.length}</p>
              <p className="text-xs text-gray-500">Total Patients</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{abnormalCount}</p>
              <p className="text-xs text-gray-500">Abnormal Vitals</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faNotesMedical} className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{incompleteCount}</p>
              <p className="text-xs text-gray-500">Incomplete Records</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="relative w-full lg:w-96">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by name, diagnosis, room, MIMIC ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm shadow-sm"
          />
        </div>
        <label className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={abnormalOnly}
            onChange={(e) => setAbnormalOnly(e.target.checked)}
            className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
          />
          <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <FontAwesomeIcon icon={faFilter} className="w-3.5 h-3.5 text-gray-500" />
            Show abnormal vitals only
          </span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <FontAwesomeIcon icon={faSpinner} spin className="w-8 h-8 text-[#1B6B7B]" />
          </div>
        ) : cleanedPatients.length === 0 ? (
          <div className="p-12 text-center">
            <FontAwesomeIcon icon={faHospitalUser} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No patients found</h3>
            <p className="text-gray-500 text-sm mt-1">
              {searchQuery || abnormalOnly
                ? "Try adjusting your filters."
                : "No patient records available."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Patient</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Room</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Diagnosis</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">HR</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">BP</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Temp</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">RR</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">SpO2</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Quality</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cleanedPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold">
                          <FontAwesomeIcon icon={faUser} className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{patient.name}</p>
                          <p className="text-sm text-gray-500">
                            {patient.displayAge}yo {patient.displayGender}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-600">{patient.room_number || "—"}</td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                        {patient.diagnosis || "Unknown"}
                      </span>
                    </td>
                    <td className={`py-4 px-6 font-medium ${patient.vitalStatus.heart_rate.color}`}>
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faHeartbeat} className="w-3.5 h-3.5 opacity-70" />
                        {patient.vital_signs.heart_rate ?? "—"}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faTint} className="w-3.5 h-3.5 opacity-70" />
                        {patient.vital_signs.blood_pressure || "—"}
                      </div>
                    </td>
                    <td className={`py-4 px-6 font-medium ${patient.vitalStatus.temperature.color}`}>
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faThermometerHalf} className="w-3.5 h-3.5 opacity-70" />
                        {formatVital(patient.vital_signs.temperature, "°C")}
                      </div>
                    </td>
                    <td className={`py-4 px-6 font-medium ${patient.vitalStatus.respiratory_rate.color}`}>
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faLungs} className="w-3.5 h-3.5 opacity-70" />
                        {patient.vital_signs.respiratory_rate ?? "—"}
                      </div>
                    </td>
                    <td className={`py-4 px-6 font-medium ${patient.vitalStatus.oxygen_saturation.color}`}>
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faTint} className="w-3.5 h-3.5 opacity-70" />
                        {formatVital(patient.vital_signs.oxygen_saturation, "%")}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit ${
                          patient.dataQuality.status === "good"
                            ? "bg-emerald-100 text-emerald-700"
                            : patient.dataQuality.status === "fair"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {patient.dataQuality.status === "good" ? (
                          <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />
                        ) : (
                          <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                        )}
                        {patient.dataQuality.label}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedPatient(patient)}
                          className="flex items-center gap-1.5 text-[#1B6B7B] hover:text-[#145a63] font-medium text-sm hover:bg-[#1B6B7B]/5 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <FontAwesomeIcon icon={faEye} className="w-4 h-4" />
                          Details
                        </button>
                        <button
                          onClick={() => setEncodingPatient(patient)}
                          className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium text-sm hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                          Log Vitals
                        </button>
                        <button
                          onClick={() => setEhrPatient(patient)}
                          className="flex items-center gap-1.5 text-indigo-700 hover:text-indigo-800 font-medium text-sm hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <FontAwesomeIcon icon={faNotesMedical} className="w-4 h-4" />
                          EHR
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faNotesMedical} className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">Clinical Information</p>
            <p className="text-sm text-blue-600/70">
              Patient data is simulated from the MIMIC-IV demo dataset for educational purposes.
              Values in red or amber indicate abnormal vital signs requiring attention. Records
              marked Incomplete are missing key fields and are shown for data-quality awareness.
            </p>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B]">
                  <FontAwesomeIcon icon={faUser} className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedPatient.displayAge}yo {selectedPatient.displayGender} ·{" "}
                    {selectedPatient.mimic_id || "No MIMIC ID"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-sm text-gray-500 mb-1 flex items-center gap-2">
                    <FontAwesomeIcon icon={faHospitalUser} className="w-4 h-4" />
                    Room
                  </p>
                  <p className="font-semibold text-gray-800">
                    {selectedPatient.room_number || "Not assigned"}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-sm text-gray-500 mb-1 flex items-center gap-2">
                    <FontAwesomeIcon icon={faCalendarDay} className="w-4 h-4" />
                    Admission
                  </p>
                  <p className="font-semibold text-gray-800">
                    {selectedPatient.admission_date
                      ? new Date(selectedPatient.admission_date).toLocaleString()
                      : "Unknown"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faHeartbeat} className="text-red-500" />
                  Vital Signs
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {(
                    [
                      ["heart_rate", faHeartbeat, "bpm"],
                      ["temperature", faThermometerHalf, "°C"],
                      ["respiratory_rate", faLungs, "/min"],
                      ["oxygen_saturation", faTint, "%"],
                    ] as const
                  ).map(([key, icon, unit]) => {
                    const value = selectedPatient.vital_signs[key];
                    const status = selectedPatient.vitalStatus[key];
                    return (
                      <div
                        key={key}
                        className={`rounded-xl p-4 border text-center ${
                          status.status === "normal"
                            ? "bg-emerald-50 border-emerald-200"
                            : status.status === "missing"
                            ? "bg-gray-50 border-gray-200"
                            : "bg-rose-50 border-rose-200"
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={icon}
                          className={`w-4 h-4 mb-1 ${
                            status.status === "normal"
                              ? "text-emerald-600"
                              : status.status === "missing"
                              ? "text-gray-400"
                              : "text-rose-600"
                          }`}
                        />
                        <p className="text-xs text-gray-500 capitalize mb-1">
                          {key.replace(/_/g, " ")}
                        </p>
                        <p className={`font-bold ${status.color}`}>
                          {formatVital(value, unit)}
                        </p>
                        {status.status !== "missing" && (
                          <p
                            className={`text-[10px] uppercase font-medium mt-1 ${
                              status.status === "normal"
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {status.status}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <div className="rounded-xl p-4 border text-center bg-gray-50 border-gray-200">
                    <FontAwesomeIcon icon={faTint} className="w-4 h-4 mb-1 text-gray-400" />
                    <p className="text-xs text-gray-500 capitalize mb-1">blood pressure</p>
                    <p className="font-bold text-gray-800">
                      {selectedPatient.vital_signs.blood_pressure || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faVial} className="text-purple-600" />
                  Lab Results
                </h3>
                {selectedPatient.labs && Object.keys(selectedPatient.labs).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(selectedPatient.labs).map(([label, value]) => (
                      <div
                        key={label}
                        className="bg-gray-50 rounded-xl p-3 border border-gray-200"
                      >
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className="font-semibold text-gray-800">{value ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No lab results available</p>
                )}
              </div>

              {selectedPatient.dataQuality.status !== "good" && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm font-medium text-amber-800 mb-1 flex items-center gap-2">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4" />
                    Data Quality Notice
                  </p>
                  <p className="text-sm text-amber-700">
                    Missing or unverified fields:{" "}
                    {selectedPatient.dataQuality.missingFields.join(", ")}.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedPatient(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-white transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Vitals Modal */}
      {encodingPatient && (
        <LogVitalsModal
          patient={encodingPatient}
          onClose={() => setEncodingPatient(null)}
        />
      )}

      {/* EHR Documentation Modal */}
      {ehrPatient && (
        <EhrModal
          patientId={ehrPatient.id}
          patientLabel={`${ehrPatient.name} · ${ehrPatient.displayAge}yo ${ehrPatient.displayGender} · ${ehrPatient.room_number || "No room"}`}
          onClose={() => setEhrPatient(null)}
        />
      )}
    </div>
  );
}

const VITAL_FIELDS = [
  { key: "heart_rate", label: "Heart Rate", unit: "bpm", step: "1", placeholder: "e.g. 80" },
  { key: "bp_systolic", label: "Systolic BP", unit: "mmHg", step: "1", placeholder: "e.g. 120" },
  { key: "bp_diastolic", label: "Diastolic BP", unit: "mmHg", step: "1", placeholder: "e.g. 80" },
  { key: "temperature_c", label: "Temperature", unit: "°C", step: "0.1", placeholder: "e.g. 36.8" },
  { key: "respiratory_rate", label: "Respiratory Rate", unit: "/min", step: "1", placeholder: "e.g. 16" },
  { key: "oxygen_saturation", label: "SpO2", unit: "%", step: "1", placeholder: "e.g. 98" },
  { key: "pain_score", label: "Pain Score", unit: "0–10", step: "1", placeholder: "e.g. 2" },
] as const;

type VitalFieldKey = (typeof VITAL_FIELDS)[number]["key"];

function LogVitalsModal({
  patient,
  onClose,
}: {
  patient: CleanedPatient;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<VitalFieldKey, string>>({
    heart_rate: "",
    bp_systolic: "",
    bp_diastolic: "",
    temperature_c: "",
    respiratory_rate: "",
    oxygen_saturation: "",
    pain_score: "",
  });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    isAnomaly: boolean;
    reasons: AnomalyReason[];
  } | null>(null);
  const [recent, setRecent] = useState<VitalReading[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const readings = await fetchMyVitalReadings(patient.id);
    setRecent(readings.slice(0, 5));
    setLoadingRecent(false);
  }, [patient.id]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const hasAnyValue = Object.values(values).some((v) => v.trim() !== "");

  const handleSubmit = async () => {
    setError(null);
    setResult(null);
    if (!hasAnyValue) {
      setError("Enter at least one vital sign.");
      return;
    }
    setSubmitting(true);
    const response = await submitVitalReading({
      patient_id: patient.id,
      heart_rate: values.heart_rate.trim() ? Number(values.heart_rate) : null,
      bp_systolic: values.bp_systolic.trim() ? Number(values.bp_systolic) : null,
      bp_diastolic: values.bp_diastolic.trim() ? Number(values.bp_diastolic) : null,
      temperature_c: values.temperature_c.trim() ? Number(values.temperature_c) : null,
      respiratory_rate: values.respiratory_rate.trim() ? Number(values.respiratory_rate) : null,
      oxygen_saturation: values.oxygen_saturation.trim() ? Number(values.oxygen_saturation) : null,
      pain_score: values.pain_score.trim() ? Number(values.pain_score) : null,
      notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (response.error) {
      setError(response.error);
      return;
    }

    setResult({
      isAnomaly: response.is_anomaly ?? false,
      reasons: response.anomaly_reasons ?? [],
    });
    setValues({
      heart_rate: "",
      bp_systolic: "",
      bp_diastolic: "",
      temperature_c: "",
      respiratory_rate: "",
      oxygen_saturation: "",
      pain_score: "",
    });
    setNotes("");
    loadRecent();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-700">
              <FontAwesomeIcon icon={faHeartbeat} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Log Vital Signs</h2>
              <p className="text-sm text-gray-500">
                {patient.name} · {patient.displayAge}yo {patient.displayGender} ·{" "}
                {patient.room_number || "No room"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {result && (
            <div
              className={`p-4 rounded-xl border ${
                result.isAnomaly
                  ? "bg-rose-50 border-rose-200"
                  : "bg-emerald-50 border-emerald-200"
              }`}
            >
              <p
                className={`text-sm font-semibold mb-1 flex items-center gap-2 ${
                  result.isAnomaly ? "text-rose-800" : "text-emerald-800"
                }`}
              >
                <FontAwesomeIcon
                  icon={result.isAnomaly ? faExclamationTriangle : faCheckCircle}
                  className="w-4 h-4"
                />
                {result.isAnomaly
                  ? "Reading saved — anomalies detected"
                  : "Reading saved — all values within normal range"}
              </p>
              {result.reasons.length > 0 && (
                <ul className="text-sm text-rose-700 list-disc pl-5 space-y-0.5">
                  {result.reasons.map((reason, i) => (
                    <li key={i}>
                      {reason.message}
                      {reason.severity === "critical" && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-600 text-white rounded">
                          Critical
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {VITAL_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {field.label}{" "}
                  <span className="text-gray-400">({field.unit})</span>
                </label>
                <input
                  type="number"
                  step={field.step}
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, patient condition, context..."
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm resize-none"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faHistory} className="w-3.5 h-3.5 text-gray-500" />
              Your recent readings for this patient
            </h3>
            {loadingRecent ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-gray-400">No readings recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((reading) => (
                  <div
                    key={reading.id}
                    className={`p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${
                      reading.is_anomaly
                        ? "bg-rose-50 border-rose-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div>
                      <p className="text-gray-700">
                        {[
                          reading.heart_rate !== null && `HR ${reading.heart_rate}`,
                          reading.bp_systolic !== null &&
                            `BP ${reading.bp_systolic}/${reading.bp_diastolic ?? "—"}`,
                          reading.temperature_c !== null && `T ${reading.temperature_c}°C`,
                          reading.respiratory_rate !== null && `RR ${reading.respiratory_rate}`,
                          reading.oxygen_saturation !== null &&
                            `SpO2 ${reading.oxygen_saturation}%`,
                          reading.pain_score !== null && `Pain ${reading.pain_score}/10`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(reading.recorded_at).toLocaleString()}
                      </p>
                    </div>
                    {reading.is_anomaly && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-rose-100 text-rose-700 rounded-full whitespace-nowrap">
                        {reading.anomaly_reasons.length} flag
                        {reading.anomaly_reasons.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-white transition-all"
          >
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !hasAnyValue}
            className="px-4 py-2.5 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
            Save Reading
          </button>
        </div>
      </div>
    </div>
  );
}
