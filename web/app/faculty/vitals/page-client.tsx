"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeartbeat,
  faExclamationTriangle,
  faCheckCircle,
  faFilter,
  faTimes,
  faChartLine,
  faMagnifyingGlass,
  faBed,
  faChevronRight,
  faUserGroup,
  faStethoscope,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { fetchFacultyVitalReadings, VitalReading } from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import Avatar from "../../components/Avatar";
import { SkeletonTable } from "../../components/skeletons";
import PatientVitalsHistory from "./PatientVitalsHistory";
import { usePageData } from "../../lib/use-page-data";

/** Stable empty fallback, so the grouping memo is not invalidated every render. */
const NO_READINGS: VitalReading[] = [];

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

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Contributor {
  user_id: string;
  name: string;
  email: string;
  readings: VitalReading[];
  flaggedCount: number;
  lastRecordedAt: string;
}

interface PatientGroup {
  patient_id: string;
  name: string;
  room: string | null;
  readings: VitalReading[];
  contributors: Contributor[];
  flaggedCount: number;
  criticalCount: number;
  latest: VitalReading;
}

/** Newest reading first, so `[0]` is always "latest" wherever we sort a list. */
function byRecency(a: VitalReading, b: VitalReading) {
  return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
}

export default function FacultyVitalsClient() {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const [expandedContributor, setExpandedContributor] = useState<string | null>(null);
  const [selected, setSelected] = useState<VitalReading | null>(null);
  const [historyFor, setHistoryFor] = useState<{
    id: string;
    name: string;
    room: string | null;
  } | null>(null);

  const { data, loading } = usePageData(`faculty:vitals:${flaggedOnly}`, () =>
    fetchFacultyVitalReadings({ flaggedOnly }),
  );
  const readings = data ?? NO_READINGS;

  // One card per patient, not per reading — the whole point of this view is
  // "who has been encoding this patient's vitals", so readings are rolled up
  // by patient first, then by the student who recorded each one.
  const patientGroups = useMemo(() => {
    const byPatient = new Map<string, PatientGroup>();
    for (const r of readings) {
      let group = byPatient.get(r.patient_id);
      if (!group) {
        group = {
          patient_id: r.patient_id,
          name: r.patients?.name ?? "Unknown patient",
          room: r.patients?.room_number ?? null,
          readings: [],
          contributors: [],
          flaggedCount: 0,
          criticalCount: 0,
          latest: r,
        };
        byPatient.set(r.patient_id, group);
      }
      group.readings.push(r);
      if (r.is_anomaly) group.flaggedCount += 1;
      if (r.anomaly_reasons.some((reason) => reason.severity === "critical")) group.criticalCount += 1;

      const studentId = r.recorded_by;
      let contributor = group.contributors.find((c) => c.user_id === studentId);
      if (!contributor) {
        contributor = {
          user_id: studentId,
          name: r.users?.name ?? "Unknown student",
          email: r.users?.email ?? "",
          readings: [],
          flaggedCount: 0,
          lastRecordedAt: r.recorded_at,
        };
        group.contributors.push(contributor);
      }
      contributor.readings.push(r);
      if (r.is_anomaly) contributor.flaggedCount += 1;
      if (new Date(r.recorded_at) > new Date(contributor.lastRecordedAt)) {
        contributor.lastRecordedAt = r.recorded_at;
      }
    }

    for (const group of byPatient.values()) {
      group.readings.sort(byRecency);
      group.latest = group.readings[0];
      group.contributors.sort((a, b) => new Date(b.lastRecordedAt).getTime() - new Date(a.lastRecordedAt).getTime());
      for (const c of group.contributors) c.readings.sort(byRecency);
    }

    return Array.from(byPatient.values()).sort(
      (a, b) =>
        b.criticalCount - a.criticalCount ||
        b.flaggedCount - a.flaggedCount ||
        new Date(b.latest.recorded_at).getTime() - new Date(a.latest.recorded_at).getTime(),
    );
  }, [readings]);

  // Search matches either the patient (name/room) or any student who has
  // encoded a reading for them — a faculty member reasonably searches by either.
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patientGroups;
    return patientGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.room?.toLowerCase().includes(q) ||
        g.contributors.some((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)),
    );
  }, [patientGroups, search]);

  const flaggedPatientCount = visibleGroups.filter((g) => g.flaggedCount > 0).length;
  const criticalPatientCount = visibleGroups.filter((g) => g.criticalCount > 0).length;

  const openGroup = visibleGroups.find((g) => g.patient_id === openPatientId) ?? null;

  const closeDrawer = () => {
    setOpenPatientId(null);
    setExpandedContributor(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHeartbeat} className="w-3.5 h-3.5" />,
          label: "Vitals Monitor",
        }}
        title="Vitals Monitor"
        subtitle="Patients tracked by vital signs — open one to see which students have been encoding readings for them"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faBed} className="w-5 h-5" />}
          value={visibleGroups.length}
          label={search.trim() ? "Matching Patients" : "Monitored Patients"}
          caption={`${visibleGroups.reduce((sum, g) => sum + g.readings.length, 0)} readings total`}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5" />}
          value={flaggedPatientCount}
          label="Flagged Patients"
          caption="Have at least one flagged reading"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5" />}
          value={criticalPatientCount}
          label="Critical Patients"
          caption="Have a critical-severity reading"
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
            aria-label="Search by patient, room, or student"
            placeholder="Search by patient, room, or student…"
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

      {loading ? (
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <SkeletonTable rows={5} cols={4} />
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-12 text-center">
          <FontAwesomeIcon icon={faHeartbeat} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No patients found</h3>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map((group, i) => {
            const tone =
              group.criticalCount > 0
                ? { bar: "bg-rose-500", ring: "ring-rose-100", badge: "bg-rose-100 text-rose-700" }
                : group.flaggedCount > 0
                  ? { bar: "bg-amber-500", ring: "ring-amber-100", badge: "bg-amber-100 text-amber-700" }
                  : { bar: "bg-emerald-500", ring: "ring-emerald-100", badge: "bg-emerald-100 text-emerald-700" };
            return (
              <button
                key={group.patient_id}
                onClick={() => setOpenPatientId(group.patient_id)}
                style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
                className="group relative flex animate-rise flex-col gap-3 overflow-hidden rounded-2xl border border-gray-200 bg-surface p-4 pl-5 text-left shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.12)]"
              >
                <span className={`absolute left-0 top-0 h-full w-1 ${tone.bar}`} aria-hidden />

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{group.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <FontAwesomeIcon icon={faBed} className="h-3 w-3" />
                      {group.room || "No room"}
                    </p>
                  </div>
                  {(group.flaggedCount > 0 || group.criticalCount > 0) && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>
                      {group.criticalCount > 0 ? "Critical" : "Flagged"}
                    </span>
                  )}
                </div>

                <p className="truncate text-xs text-gray-500">{formatVitals(group.latest)}</p>

                <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      {group.contributors.slice(0, 3).map((c) => (
                        <span key={c.user_id} className={`rounded-full ring-2 ${tone.ring} ring-offset-0`}>
                          <Avatar name={c.name} size="xs" tone="brand" />
                        </span>
                      ))}
                      {group.contributors.length > 3 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
                          +{group.contributors.length - 3}
                        </span>
                      )}
                    </div>
                    <span className="ml-2.5 text-xs text-gray-500">
                      {group.contributors.length} student{group.contributors.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                    View
                    <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Contributors modal: who has been encoding this patient's vitals */}
      {openGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-4xl animate-[fadeInUp_0.2s_ease-out] flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                  <FontAwesomeIcon icon={faUserGroup} className="h-3 w-3" />
                  Encoded by
                </p>
                <h2 className="mt-1 truncate text-2xl font-bold text-gray-900">{openGroup.name}</h2>
                <p className="flex items-center gap-1.5 text-sm text-gray-500">
                  <FontAwesomeIcon icon={faBed} className="h-3 w-3" />
                  {openGroup.room || "No room"} · {openGroup.readings.length} reading
                  {openGroup.readings.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={closeDrawer}
                className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faTimes} className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2.5">
              {openGroup.contributors.map((c) => {
                const expanded = expandedContributor === c.user_id;
                return (
                  <div
                    key={c.user_id}
                    className="overflow-hidden rounded-xl border border-gray-200 transition-colors"
                  >
                    <button
                      onClick={() => setExpandedContributor(expanded ? null : c.user_id)}
                      className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-black/5"
                    >
                      <Avatar name={c.name} size="md" tone="brand" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{c.name}</p>
                        <p className="truncate text-xs text-gray-500">{c.email}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs font-medium text-gray-600">
                          {c.readings.length} reading{c.readings.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-[11px] text-gray-400">{timeAgo(c.lastRecordedAt)}</span>
                      </div>
                      <FontAwesomeIcon
                        icon={faChevronRight}
                        className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </button>

                    {expanded && (
                      <div className="grid grid-cols-1 gap-2 border-t border-gray-100 bg-gray-50 p-3 sm:grid-cols-2">
                        {c.readings.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setSelected(r)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-surface px-3.5 py-3 text-left transition-colors hover:border-brand-500/40 hover:bg-black/5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-gray-700">{formatVitals(r)}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(r.recorded_at).toLocaleString()}
                              </p>
                            </div>
                            {r.is_anomaly ? (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="h-2.5 w-2.5" />
                                {r.anomaly_reasons.length}
                              </span>
                            ) : (
                              <FontAwesomeIcon icon={faCheckCircle} className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 p-4">
              <button
                onClick={() => {
                  setHistoryFor({ id: openGroup.patient_id, name: openGroup.name, room: openGroup.room });
                  closeDrawer();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faChartLine} className="h-4 w-4" />
                View full vitals history
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
            <div className="p-4 border-b border-hairline">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <FontAwesomeIcon icon={faStethoscope} className="h-4 w-4 text-brand-600" />
                  Reading Details
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-gray-600">
                  {selected.users?.name ?? "Unknown"}
                </p>
                <p className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-brand-700">
                  <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
                  {new Date(selected.recorded_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
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
