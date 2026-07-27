"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeartbeat,
  faExclamationTriangle,
  faCheckCircle,
  faFilter,
  faTimes,
  faEye,
  faUser,
  faChartLine,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { fetchFacultyVitalReadings, VitalReading } from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Card from "../../components/Card";
import { SkeletonTable } from "../../components/skeletons";
import ActionsMenu from "../../components/ActionsMenu";
import PatientVitalsHistory from "./PatientVitalsHistory";

function formatVitals(reading: VitalReading): string {
  return [
    reading.heart_rate !== null && `HR ${reading.heart_rate}`,
    reading.bp_systolic !== null && `BP ${reading.bp_systolic}/${reading.bp_diastolic ?? "—"}`,
    reading.temperature_c !== null && `T ${reading.temperature_c}°C`,
    reading.respiratory_rate !== null && `RR ${reading.respiratory_rate}`,
    reading.oxygen_saturation !== null && `SpO2 ${reading.oxygen_saturation}%`,
    reading.pain_score !== null && `Pain ${reading.pain_score}/10`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function FacultyVitalsClient() {
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VitalReading | null>(null);
  const [historyFor, setHistoryFor] = useState<{
    id: string;
    name: string;
    room: string | null;
  } | null>(null);

  const loadReadings = useCallback(async () => {
    setLoading(true);
    const data = await fetchFacultyVitalReadings({ flaggedOnly });
    setReadings(data);
    setLoading(false);
  }, [flaggedOnly]);

  useEffect(() => {
    loadReadings();
  }, [loadReadings]);

  // Search narrows the loaded page of readings by the people and places a
  // faculty member would actually search for — student, patient, or room.
  const visibleReadings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return readings;
    return readings.filter((r) =>
      [r.users?.name, r.users?.email, r.patients?.name, r.patients?.room_number].some((field) =>
        field?.toLowerCase().includes(q),
      ),
    );
  }, [readings, search]);

  // Counted off the visible set, so the tiles never disagree with the table.
  const flaggedCount = visibleReadings.filter((r) => r.is_anomaly).length;
  const criticalCount = visibleReadings.filter((r) =>
    r.anomaly_reasons.some((reason) => reason.severity === "critical"),
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHeartbeat} className="w-3.5 h-3.5" />,
          label: "Vitals Monitor",
        }}
        title="Vitals Monitor"
        subtitle="Vital sign readings encoded by students, flagged by the rule-based anomaly detector"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faHeartbeat} className="w-5 h-5" />}
          value={visibleReadings.length}
          label={search.trim() ? "Matching Readings" : "Recent Readings"}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5" />}
          value={flaggedCount}
          label="Flagged Readings"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5" />}
          value={criticalCount}
          label="With Critical Values"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search readings by student, patient, or room"
            placeholder="Search by student, patient, or room…"
            className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-3 px-4 py-2.5 bg-surface border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
          />
          <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <FontAwesomeIcon icon={faFilter} className="w-3.5 h-3.5 text-gray-500" />
            Show flagged readings only
          </span>
        </label>
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : visibleReadings.length === 0 ? (
          <div className="p-12 text-center">
            <FontAwesomeIcon icon={faHeartbeat} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No readings found</h3>
            <p className="text-gray-500 text-sm mt-1">
              {search.trim()
                ? `Nothing matches “${search.trim()}”.`
                : flaggedOnly
                  ? "No flagged readings — nothing needs attention."
                  : "Students have not encoded any vital signs yet."}
            </p>
            {search.trim() && (
              <button
                onClick={() => setSearch("")}
                className="mt-4 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-subtle border-b border-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vitals</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Recorded</th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visibleReadings.map((reading) => (
                  <tr key={reading.id} className="hover:bg-subtle transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-brand-600/10 rounded-full flex items-center justify-center text-brand-600">
                          <FontAwesomeIcon icon={faUser} className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {reading.users?.name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">{reading.users?.email ?? ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() =>
                          setHistoryFor({
                            id: reading.patient_id,
                            name: reading.patients?.name ?? "Unknown",
                            room: reading.patients?.room_number ?? null,
                          })
                        }
                        className="text-left transition-colors hover:text-brand-700"
                        title="View this patient's vitals history"
                      >
                        <p className="font-medium text-gray-800 underline decoration-gray-300 decoration-dotted underline-offset-4 hover:decoration-brand-500">
                          {reading.patients?.name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {reading.patients?.room_number || "No room"}
                        </p>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-sm">{formatVitals(reading)}</td>
                    <td className="py-3 px-4">
                      {reading.is_anomaly ? (
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit ${
                            reading.anomaly_reasons.some((r) => r.severity === "critical")
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                          {reading.anomaly_reasons.length} flag
                          {reading.anomaly_reasons.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit bg-emerald-100 text-emerald-700">
                          <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(reading.recorded_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <ActionsMenu
                        variant="compact"
                        label={`Actions for ${reading.patients?.name ?? "this reading"}`}
                        actions={[
                          {
                            label: "Reading details",
                            icon: faEye,
                            onClick: () => setSelected(reading),
                          },
                          {
                            label: "Patient history",
                            icon: faChartLine,
                            onClick: () =>
                              setHistoryFor({
                                id: reading.patient_id,
                                name: reading.patients?.name ?? "Unknown",
                                room: reading.patients?.room_number ?? null,
                              }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Reading Details</h2>
                <p className="text-sm text-gray-500">
                  {selected.users?.name ?? "Unknown"} → {selected.patients?.name ?? "Unknown"} ·{" "}
                  {new Date(selected.recorded_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Heart Rate", selected.heart_rate, "bpm"],
                    ["Systolic BP", selected.bp_systolic, "mmHg"],
                    ["Diastolic BP", selected.bp_diastolic, "mmHg"],
                    ["Temperature", selected.temperature_c, "°C"],
                    ["Respiratory Rate", selected.respiratory_rate, "/min"],
                    ["SpO2", selected.oxygen_saturation, "%"],
                    ["Pain Score", selected.pain_score, "/10"],
                  ] as const
                ).map(([label, value, unit]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="font-semibold text-gray-800">
                      {value !== null ? `${value} ${unit}` : "—"}
                    </p>
                  </div>
                ))}
              </div>

              {selected.anomaly_reasons.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <p className="text-sm font-semibold text-rose-800 mb-2 flex items-center gap-2">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4" />
                    Detected Anomalies
                  </p>
                  <ul className="text-sm text-rose-700 list-disc pl-5 space-y-0.5">
                    {selected.anomaly_reasons.map((reason, i) => (
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
                </div>
              )}

              {selected.notes && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">Student Notes</p>
                  <p className="text-sm text-gray-700">{selected.notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between gap-2">
              <button
                onClick={() => {
                  setHistoryFor({
                    id: selected.patient_id,
                    name: selected.patients?.name ?? "Unknown",
                    room: selected.patients?.room_number ?? null,
                  });
                  setSelected(null);
                }}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium text-brand-600 transition-all hover:bg-brand-600/5"
              >
                <FontAwesomeIcon icon={faChartLine} className="w-4 h-4" />
                Patient history
              </button>
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-surface transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <PatientVitalsHistory
          key={historyFor.id}
          patientId={historyFor.id}
          patientName={historyFor.name}
          roomNumber={historyFor.room}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}
