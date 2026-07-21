"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faNotesMedical,
  faCheckCircle,
  faArrowLeft,
  faHeartPulse,
  faTint,
  faFileLines,
  faVenusMars,
  faHashtag,
  faUsers,
  faSearch,
  faChevronDown,
  faChevronUp,
  faSpinner,
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
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<EhrType>("note");
  const [records, setRecords] = useState<EhrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [studentFilter, setStudentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewingAll, setReviewingAll] = useState(false);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.room_number?.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        p.mimic_id?.toLowerCase().includes(q),
    );
  }, [patients, search]);

  const studentOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of records) {
      const email = r.users?.email;
      if (email && r.users?.name) {
        map.set(email, { id: email, name: r.users.name });
      }
    }
    return Array.from(map.values());
  }, [records]);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (studentFilter !== "all") {
      list = list.filter((r) => r.users?.email === studentFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter((r) => new Date(r.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((r) => new Date(r.created_at) <= to);
    }
    return list;
  }, [records, studentFilter, dateFrom, dateTo]);

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
    setStudentFilter("all");
    setDateFrom("");
    setDateTo("");
    setSelectedIds(new Set());
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

  const handleBulkReview = async () => {
    if (selectedIds.size === 0) return;
    setReviewingAll(true);
    setError(null);
    for (const id of selectedIds) {
      const result = await reviewProgressNote(id);
      if (result.error) {
        setError(result.error);
        break;
      }
    }
    setReviewingAll(false);
    setSelectedIds(new Set());
    if (selectedPatient) {
      loadRecords(selectedPatient.id, tab);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
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

        <div className="relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search patients by name, room, diagnosis, or MIMIC ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] transition-all"
          />
        </div>

        {loading ? (
          <SkeletonPatientGrid />
        ) : patients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-12 text-center">
            <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No patients found</h3>
            <p className="text-gray-500 text-sm mt-1">No patients have been assigned yet.</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-12 text-center">
            <FontAwesomeIcon icon={faSearch} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No matching patients</h3>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((patient) => (
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
                    <FontAwesomeIcon icon={faHashtag} className="w-3 h-3 text-gray-400" />
                    <span className="truncate">{patient.diagnosis}</span>
                  </div>
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
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100/80 bg-gray-50/30 flex-wrap">
              {studentOptions.length > 1 && (
                <select
                  value={studentFilter}
                  onChange={(e) => setStudentFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30"
                >
                  <option value="all">All students</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30"
                title="From date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30"
                title="To date"
              />
              <span className="text-xs text-gray-400 ml-auto">
                {filteredRecords.length} of {records.length} record{records.length !== 1 ? "s" : ""}
              </span>
              {tab === "note" && selectedIds.size > 0 && (
                <button
                  onClick={handleBulkReview}
                  disabled={reviewingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#1B6B7B] hover:bg-[#145a68] rounded-lg transition-colors disabled:opacity-60"
                >
                  {reviewingAll ? (
                    <FontAwesomeIcon icon={faSpinner} spin className="w-3.5 h-3.5" />
                  ) : (
                    <FontAwesomeIcon icon={faCheckCircle} className="w-3.5 h-3.5" />
                  )}
                  Mark reviewed ({selectedIds.size})
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    {tab === "note" && (
                      <th className="w-10 py-3 px-4">
                        <input
                          type="checkbox"
                          checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 accent-[#1B6B7B] rounded"
                        />
                      </th>
                    )}
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Entry</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recorded</th>
                    {tab === "note" && (
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Review</th>
                    )}
                    <th className="w-10 py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {filteredRecords.map((record) => (
                    <Fragment key={record.id}>
                      <tr
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                      >
                        {tab === "note" && (
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            {!record.reviewed_at && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(record.id)}
                                onChange={() => toggleSelect(record.id)}
                                className="w-4 h-4 accent-[#1B6B7B] rounded"
                              />
                            )}
                          </td>
                        )}
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
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
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
                        <td className="py-3 px-4 text-gray-400">
                          <FontAwesomeIcon
                            icon={expandedId === record.id ? faChevronUp : faChevronDown}
                            className="w-3.5 h-3.5"
                          />
                        </td>
                      </tr>
                      {expandedId === record.id && (
                        <tr className="bg-gray-50/50">
                          <td
                            colSpan={tab === "note" ? 6 : 5}
                            className="px-4 py-4 border-b border-gray-100"
                          >
                            <ExpandableRow record={record} tab={tab} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExpandableRow({ record, tab }: { record: EhrRecord; tab: EhrType }) {
  if (tab === "tpr") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DetailBox label="Shift" value={record.shift ?? "—"} />
        <DetailBox label="Temperature" value={record.temperature_c != null ? `${record.temperature_c}°C` : "—"} />
        <DetailBox label="Pulse" value={record.pulse != null ? `${record.pulse} bpm` : "—"} />
        <DetailBox label="Respiration" value={record.respiration != null ? `${record.respiration} /min` : "—"} />
        {record.remarks && <DetailBox label="Remarks" value={record.remarks} fullWidth />}
      </div>
    );
  }
  if (tab === "ivf") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DetailBox label="Solution" value={record.solution ?? "—"} />
        <DetailBox label="Volume" value={record.volume_ml != null ? `${record.volume_ml} mL` : "—"} />
        <DetailBox label="Rate" value={record.rate_ml_hr != null ? `${record.rate_ml_hr} mL/hr` : "—"} />
        <DetailBox label="Site" value={record.site ?? "—"} />
        <DetailBox label="Status" value={record.status ?? "—"} />
        <DetailBox label="Started" value={record.started_at ? new Date(record.started_at).toLocaleString() : "—"} />
        <DetailBox label="Ended" value={record.ended_at ? new Date(record.ended_at).toLocaleString() : "—"} />
        {record.remarks && <DetailBox label="Remarks" value={record.remarks} fullWidth />}
      </div>
    );
  }
  return (
    <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
      {record.content}
      {record.remarks && (
        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200">{record.remarks}</p>
      )}
    </div>
  );
}

function DetailBox({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={`${fullWidth ? "sm:col-span-4" : ""} bg-white rounded-lg border border-gray-200 p-3`}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
