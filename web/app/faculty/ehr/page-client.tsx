"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faNotesMedical, faSpinner, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyEhrRecords,
  reviewProgressNote,
  EhrRecord,
  EhrType,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

const TABS: { id: EhrType; label: string }[] = [
  { id: "tpr", label: "TPR Sheets" },
  { id: "ivf", label: "IVF Sheets" },
  { id: "note", label: "Progress Notes" },
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
  const [tab, setTab] = useState<EhrType>("note");
  const [records, setRecords] = useState<EhrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRecords(await fetchFacultyEhrRecords(tab));
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setError(null);
    load();
  }, [load]);

  const handleReview = async (noteId: string) => {
    setError(null);
    const result = await reviewProgressNote(noteId);
    if (result.error) {
      setError(result.error);
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faNotesMedical} className="w-3.5 h-3.5" />,
          label: "EHR Review",
        }}
        title="EHR Review"
        subtitle="Clinical documentation encoded by students — review and sign off progress notes"
      />

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="border-b border-gray-100/80 flex gap-4 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-4 font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#1B6B7B] text-[#1B6B7B]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
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
          <div className="flex items-center justify-center p-12">
            <FontAwesomeIcon icon={faSpinner} spin className="w-8 h-8 text-[#1B6B7B]" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <FontAwesomeIcon icon={faNotesMedical} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No records yet</h3>
            <p className="text-gray-500 text-sm mt-1">
              Students have not encoded any {tab === "tpr" ? "TPR sheets" : tab === "ivf" ? "IVF sheets" : "progress notes"} yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
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
                    <td className="py-3 px-4">
                      <p className="text-gray-800">{record.patients?.name ?? "Unknown"}</p>
                      <p className="text-xs text-gray-500">{record.patients?.room_number || "No room"}</p>
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
