"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faNotesMedical,
  faCheckCircle,
  faArrowLeft,
  faHeartPulse,
  faTint,
  faFileLines,
  faVenusMars,
  faCalendar,
  faHashtag,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyEhrRecords,
  fetchFacultyPatients,
  reviewProgressNote,
  EhrRecord,
  EhrType,
  FacultyPatient,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import { SkeletonPatientGrid, SkeletonEhrTable } from "../../components/skeletons";

const TABS: { id: EhrType; label: string; icon: typeof faHeartPulse }[] = [
  { id: "tpr", label: "TPR Sheets", icon: faHeartPulse },
  { id: "ivf", label: "IVF Sheets", icon: faTint },
  { id: "note", label: "Progress Notes", icon: faFileLines },
];

function summarize(record: EhrRecord, type: EhrType): string {
  if (type === "tpr") {
    return [
      record.shift && `${record.shift} shift`,
      record.temperature_c != null && `T ${record.temperature_c}°C`,
      record.pulse != null && `P ${record.pulse}`,
      record.respiration != null && `R ${record.respiration}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (type === "ivf") {
    return [
      record.solution,
      record.volume_ml != null && `${record.volume_ml} mL`,
      record.rate_ml_hr != null && `@ ${record.rate_ml_hr} mL/hr`,
      record.site,
      record.status && `(${record.status})`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return record.content ?? "";
}

export default function FacultyEhrClient() {
  const [patients, setPatients] = useState<FacultyPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<FacultyPatient | null>(null);
  const [tab, setTab] = useState<EhrType>("note");
  const [records, setRecords] = useState<EhrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    const data = await fetchFacultyPatients();
    setPatients(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const loadRecords = useCallback(async (patientId: string, type: EhrType) => {
    setLoading(true);
    const data = await fetchFacultyEhrRecords(type, { patientId });
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
    setError(null);
    loadRecords(selectedPatient.id, tab);
  }, [selectedPatient, tab, loadRecords]);

  const handleReview = async (noteId: string) => {
    setError(null);
    const result = await reviewProgressNote(noteId);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (selectedPatient) {
      loadRecords(selectedPatient.id, tab);
    }
  };

  const selectPatient = (patient: FacultyPatient) => {
    setSelectedPatient(patient);
    setTab("note");
    setError(null);
  };

  const goBack = () => {
    setSelectedPatient(null);
    setRecords([]);
    setError(null);
  };

  if (!selectedPatient) {
    return (
      <div className="space-y-4">
        <PageHeader
          badge={{
            icon: <FontAwesomeIcon icon={faNotesMedical} className="w-3.5 h-3.5" />,
            label: "EHR Review",
          }}
          title="EHR Review"
          subtitle="Select a patient to view their clinical documentation"
        />

        {loading ? (
          <SkeletonPatientGrid />
        ) : patients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-12 text-center">
            <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No patients found</h3>
            <p className="text-gray-500 text-sm mt-1">No patients have been assigned yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => selectPatient(patient)}
                className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-4 text-left hover:border-[#1B6B7B]/40 hover:shadow-[0_4px_12px_rgba(27,107,123,0.1)] transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold group-hover:bg-[#1B6B7B]/20 transition-colors">
                    {patient.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{patient.name}</p>
                    <p className="text-sm text-gray-500">{patient.age}yo {patient.gender}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <FontAwesomeIcon icon={faHashtag} className="w-3 h-3 text-gray-400" />
                    <span>{patient.room_number || "No room"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-gray-400" />
                    <span>{new Date(patient.admission_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded truncate block">
                    {patient.diagnosis}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={goBack}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faVenusMars} className="w-3 h-3" />
              {selectedPatient.age}yo {selectedPatient.gender}
            </span>
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faHashtag} className="w-3 h-3" />
              {selectedPatient.room_number || "No room"}
            </span>
            <span className="px-2 py-0.5 bg-gray-100 text-xs text-gray-600 rounded">
              {selectedPatient.diagnosis}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="border-b border-gray-100/80 flex gap-4 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 py-4 font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#1B6B7B] text-[#1B6B7B]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <FontAwesomeIcon icon={t.icon} className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="m-6 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonEhrTable />
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <FontAwesomeIcon icon={faNotesMedical} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No records yet</h3>
            <p className="text-gray-500 text-sm mt-1">
              No {tab === "tpr" ? "TPR sheets" : tab === "ivf" ? "IVF sheets" : "progress notes"} recorded for this patient.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Entry</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recorded</th>
                  {tab === "note" && (
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Review</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-gray-800">{record.users?.name ?? "Unknown"}</p>
                      <p className="text-xs text-gray-500">{record.users?.email ?? ""}</p>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 max-w-md">
                      <p className="line-clamp-2">{summarize(record, tab)}</p>
                      {record.remarks && tab !== "note" && (
                        <p className="text-xs text-gray-400 mt-0.5">{record.remarks}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(record.created_at).toLocaleString()}
                    </td>
                    {tab === "note" && (
                      <td className="py-3 px-4">
                        {record.reviewed_at ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit bg-emerald-100 text-emerald-700">
                            <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />
                            Reviewed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleReview(record.id)}
                            className="px-3 py-1.5 text-sm font-medium text-[#1B6B7B] hover:bg-[#1B6B7B]/5 border border-[#1B6B7B]/30 rounded-lg transition-colors"
                          >
                            Mark reviewed
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
