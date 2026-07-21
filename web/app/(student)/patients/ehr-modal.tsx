"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faNotesMedical, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import {
  fetchMyEhrRecords,
  createEhrRecord,
  updateIvfStatus,
  EhrRecord,
  EhrType,
} from "../../lib/api";

const inputClass =
  "w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm";

const TABS: { id: EhrType; label: string }[] = [
  { id: "tpr", label: "TPR Sheet" },
  { id: "ivf", label: "IVF Sheet" },
  { id: "note", label: "Progress Notes" },
];

export default function EhrModal({
  patientId,
  patientLabel,
  onClose,
}: {
  patientId: string;
  patientLabel: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<EhrType>("tpr");
  const [records, setRecords] = useState<EhrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setRecords(await fetchMyEhrRecords(tab, patientId));
    setLoading(false);
  }, [tab, patientId]);

  useEffect(() => {
    setError(null);
    setForm({});
    load();
  }, [load]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    const result = await createEhrRecord({ type: tab, patient_id: patientId, ...form });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setForm({});
    load();
  };

  const handleIvfStatus = async (id: string, status: "completed" | "discontinued") => {
    setError(null);
    const result = await updateIvfStatus(id, status);
    if (result.error) {
      setError(result.error);
      return;
    }
    load();
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-600/10 rounded-full flex items-center justify-center text-brand-600">
              <FontAwesomeIcon icon={faNotesMedical} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">EHR Documentation</h2>
              <p className="text-sm text-gray-500">{patientLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="border-b border-gray-100 flex gap-6 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 font-medium text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          {tab === "tpr" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <select value={form.shift ?? ""} onChange={set("shift")} className={inputClass}>
                <option value="">Shift…</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
                <option value="Night">Night</option>
              </select>
              <input type="number" step="0.1" placeholder="Temp °C" value={form.temperature_c ?? ""} onChange={set("temperature_c")} className={inputClass} />
              <input type="number" placeholder="Pulse" value={form.pulse ?? ""} onChange={set("pulse")} className={inputClass} />
              <input type="number" placeholder="Respiration" value={form.respiration ?? ""} onChange={set("respiration")} className={inputClass} />
              <input type="text" placeholder="Remarks (optional)" value={form.remarks ?? ""} onChange={set("remarks")} className={`${inputClass} col-span-2 sm:col-span-3`} />
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving…" : "Add Entry"}
              </button>
            </div>
          )}

          {tab === "ivf" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input type="text" placeholder="Solution (e.g. PNSS 1L)" value={form.solution ?? ""} onChange={set("solution")} className={`${inputClass} col-span-2`} />
              <input type="number" placeholder="Volume mL" value={form.volume_ml ?? ""} onChange={set("volume_ml")} className={inputClass} />
              <input type="number" step="0.1" placeholder="Rate mL/hr" value={form.rate_ml_hr ?? ""} onChange={set("rate_ml_hr")} className={inputClass} />
              <input type="text" placeholder="Site (e.g. L metacarpal)" value={form.site ?? ""} onChange={set("site")} className={`${inputClass} col-span-2`} />
              <input type="text" placeholder="Remarks (optional)" value={form.remarks ?? ""} onChange={set("remarks")} className={inputClass} />
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving…" : "Start IVF"}
              </button>
            </div>
          )}

          {tab === "note" && (
            <div className="space-y-3">
              <textarea rows={3} placeholder="Progress note (FDAR or narrative)…" value={form.content ?? ""} onChange={set("content")} className={`${inputClass} resize-none`} />
              <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Add Note"}
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Your entries</h3>
            {loading ? (
              <FontAwesomeIcon icon={faSpinner} spin className="w-5 h-5 text-brand-600" />
            ) : records.length === 0 ? (
              <p className="text-sm text-gray-400">No entries yet for this patient.</p>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                    {tab === "tpr" && (
                      <p className="text-gray-700">
                        {[record.shift && `${record.shift} shift`, record.temperature_c != null && `T ${record.temperature_c}°C`, record.pulse != null && `P ${record.pulse}`, record.respiration != null && `R ${record.respiration}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {tab === "ivf" && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-gray-700">
                          {record.solution}
                          {record.volume_ml != null && ` · ${record.volume_ml} mL`}
                          {record.rate_ml_hr != null && ` @ ${record.rate_ml_hr} mL/hr`}
                          {record.site && ` · ${record.site}`}
                          <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${record.status === "ongoing" ? "bg-blue-100 text-blue-700" : record.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                            {record.status}
                          </span>
                        </p>
                        {record.status === "ongoing" && (
                          <span className="flex gap-1 whitespace-nowrap">
                            <button onClick={() => handleIvfStatus(record.id, "completed")} className="text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg">
                              Complete
                            </button>
                            <button onClick={() => handleIvfStatus(record.id, "discontinued")} className="text-xs font-medium text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg">
                              Discontinue
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                    {tab === "note" && (
                      <p className="text-gray-700">
                        {record.content}
                        {record.reviewed_at && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded">
                            Reviewed
                          </span>
                        )}
                      </p>
                    )}
                    {record.remarks && tab !== "note" && (
                      <p className="text-xs text-gray-500 mt-0.5">{record.remarks}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(record.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-surface transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
