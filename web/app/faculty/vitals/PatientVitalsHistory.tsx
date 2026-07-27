"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faExclamationTriangle,
  faCheckCircle,
  faHeartbeat,
} from "@fortawesome/free-solid-svg-icons";
import { fetchFacultyVitalReadings, VitalReading } from "../../lib/api";

const BRAND = "#1b6b7b";
const GRID = "#eef2f6";
const AXIS_INK = "#94a3b8";

/** A point that actually carries a value — nulls are dropped, not zeroed. */
interface Point {
  v: number;
  at: string;
  flagged: boolean;
}

interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  /** Reference band for a healthy adult, drawn recessively behind the line. */
  normal: [number, number];
  read: (r: VitalReading) => number | null;
  /** Decimals to show; temperature is the only sub-integer vital here. */
  precision?: number;
}

const METRICS: MetricSpec[] = [
  { key: "hr", label: "Heart Rate", unit: "bpm", normal: [60, 100], read: (r) => r.heart_rate },
  {
    key: "temp",
    label: "Temperature",
    unit: "°C",
    normal: [36.1, 37.2],
    read: (r) => r.temperature_c,
    precision: 1,
  },
  {
    key: "rr",
    label: "Respiratory Rate",
    unit: "/min",
    normal: [12, 20],
    read: (r) => r.respiratory_rate,
  },
  { key: "spo2", label: "SpO₂", unit: "%", normal: [95, 100], read: (r) => r.oxygen_saturation },
  { key: "pain", label: "Pain Score", unit: "/10", normal: [0, 3], read: (r) => r.pain_score },
];

function fmt(v: number, precision = 0) {
  return v.toFixed(precision);
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One vital, over time.
 *
 * Each vital gets its own chart and its own y-scale on purpose: heart rate and
 * temperature share no unit, and putting them on one pair of axes would invent
 * crossings that mean nothing. Points are evenly spaced by sequence rather than
 * by clock time — readings are encoded ad hoc, and true time spacing collapses
 * a shift's worth of them into an unreadable clump. Exact timestamps are on
 * every tooltip and in the table below.
 */
function VitalTrend({ spec, points }: { spec: MetricSpec; points: Point[] }) {
  const W = 320;
  const H = 104;
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = points.length;

  // Domain always contains the normal band, so "in range" is judgeable at a
  // glance instead of depending on where this patient's readings happen to sit.
  const values = points.map((p) => p.v);
  const lo = Math.min(...values, spec.normal[0]);
  const hi = Math.max(...values, spec.normal[1]);
  const pad = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.05);
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const bandTop = y(Math.min(spec.normal[1], yMax));
  const bandBottom = y(Math.max(spec.normal[0], yMin));
  const line = points.map((p, i) => `${x(i)},${y(p.v)}`).join(" ");

  const latest = points[n - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latestOutOfRange = latest.v < spec.normal[0] || latest.v > spec.normal[1];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600">{spec.label}</p>
        <p className="text-[11px] text-gray-400">
          {n} reading{n === 1 ? "" : "s"}
        </p>
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span
          className={`font-display text-2xl font-bold tabular-nums leading-none ${
            latestOutOfRange ? "text-amber-600" : "text-gray-900"
          }`}
        >
          {fmt(latest.v, spec.precision)}
        </span>
        <span className="text-xs text-gray-500">{spec.unit}</span>
        <span className="ml-auto text-[11px] tabular-nums text-gray-400">
          {fmt(min, spec.precision)}–{fmt(max, spec.precision)}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`${spec.label} trend. Latest ${fmt(latest.v, spec.precision)} ${spec.unit}. Range ${fmt(min, spec.precision)} to ${fmt(max, spec.precision)}.`}
      >
        {/* Normal band — recessive, so the line stays the figure. */}
        <rect
          x={padL}
          y={bandTop}
          width={plotW}
          height={Math.max(0, bandBottom - bandTop)}
          fill={BRAND}
          opacity="0.06"
        />
        <line x1={padL} y1={bandTop} x2={W - padR} y2={bandTop} stroke={GRID} strokeWidth="1" />
        <line
          x1={padL}
          y1={bandBottom}
          x2={W - padR}
          y2={bandBottom}
          stroke={GRID}
          strokeWidth="1"
        />
        <text x={padL - 4} y={bandTop + 3} textAnchor="end" fontSize="8" fill={AXIS_INK}>
          {fmt(spec.normal[1], spec.precision)}
        </text>
        <text x={padL - 4} y={bandBottom + 3} textAnchor="end" fontSize="8" fill={AXIS_INK}>
          {fmt(spec.normal[0], spec.precision)}
        </text>

        {n > 1 && (
          <polyline
            points={line}
            fill="none"
            stroke={BRAND}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={`${p.at}-${i}`}
            cx={x(i)}
            cy={y(p.v)}
            r={n > 30 ? 2 : 3}
            fill={p.flagged ? "#f59e0b" : "#fff"}
            stroke={p.flagged ? "#b45309" : BRAND}
            strokeWidth="2"
          >
            <title>
              {`${fmt(p.v, spec.precision)} ${spec.unit} · ${shortTime(p.at)}${p.flagged ? " · flagged" : ""}`}
            </title>
          </circle>
        ))}

        <text x={padL} y={H - 4} fontSize="8" fill={AXIS_INK}>
          {shortTime(points[0].at)}
        </text>
        {n > 1 && (
          <text x={W - padR} y={H - 4} textAnchor="end" fontSize="8" fill={AXIS_INK}>
            {shortTime(latest.at)}
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * Blood pressure is the one chart that carries two series, because systolic and
 * diastolic share a unit and a scale — so one axis is honest here. They are
 * told apart by a dashed stroke and end labels, never by hue alone.
 */
function BloodPressureTrend({
  points,
}: {
  points: { sys: number; dia: number | null; at: string; flagged: boolean }[];
}) {
  const W = 320;
  const H = 104;
  const padL = 30;
  const padR = 26;
  const padT = 10;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = points.length;

  const all = points.flatMap((p) => (p.dia !== null ? [p.sys, p.dia] : [p.sys]));
  const lo = Math.min(...all, 60);
  const hi = Math.max(...all, 120);
  const pad = (hi - lo) * 0.15 || 5;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const sysLine = points.map((p, i) => `${x(i)},${y(p.sys)}`).join(" ");
  const diaPts = points.map((p, i) => ({ p, i })).filter((d) => d.p.dia !== null);
  const diaLine = diaPts.map((d) => `${x(d.i)},${y(d.p.dia as number)}`).join(" ");

  const latest = points[n - 1];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600">Blood Pressure</p>
        <p className="text-[11px] text-gray-400">
          {n} reading{n === 1 ? "" : "s"}
        </p>
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold tabular-nums leading-none text-gray-900">
          {latest.sys}/{latest.dia ?? "—"}
        </span>
        <span className="text-xs text-gray-500">mmHg</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Blood pressure trend. Latest ${latest.sys} over ${latest.dia ?? "unknown"} mmHg.`}
      >
        <rect
          x={padL}
          y={y(120)}
          width={plotW}
          height={Math.max(0, y(90) - y(120))}
          fill={BRAND}
          opacity="0.06"
        />
        {[90, 120].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 4} y={y(g) + 3} textAnchor="end" fontSize="8" fill={AXIS_INK}>
              {g}
            </text>
          </g>
        ))}

        {n > 1 && (
          <polyline
            points={sysLine}
            fill="none"
            stroke={BRAND}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {diaPts.length > 1 && (
          <polyline
            points={diaLine}
            fill="none"
            stroke={BRAND}
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        )}
        {points.map((p, i) => (
          <g key={`${p.at}-${i}`}>
            <circle
              cx={x(i)}
              cy={y(p.sys)}
              r={n > 30 ? 2 : 3}
              fill={p.flagged ? "#f59e0b" : "#fff"}
              stroke={p.flagged ? "#b45309" : BRAND}
              strokeWidth="2"
            >
              <title>{`${p.sys}/${p.dia ?? "—"} mmHg · ${shortTime(p.at)}${p.flagged ? " · flagged" : ""}`}</title>
            </circle>
            {p.dia !== null && (
              <circle cx={x(i)} cy={y(p.dia)} r={n > 30 ? 2 : 3} fill="#fff" stroke={BRAND} strokeWidth="2" opacity="0.75">
                <title>{`${p.sys}/${p.dia} mmHg · ${shortTime(p.at)}`}</title>
              </circle>
            )}
          </g>
        ))}

        {/* Direct labels, so the two series never rely on the stroke alone. */}
        <text x={W - padR + 3} y={y(latest.sys) + 3} fontSize="8" fill={AXIS_INK}>
          Sys
        </text>
        {latest.dia !== null && (
          <text x={W - padR + 3} y={y(latest.dia) + 3} fontSize="8" fill={AXIS_INK}>
            Dia
          </text>
        )}
        <text x={padL} y={H - 4} fontSize="8" fill={AXIS_INK}>
          {shortTime(points[0].at)}
        </text>
        {n > 1 && (
          <text x={W - padR} y={H - 4} textAnchor="end" fontSize="8" fill={AXIS_INK}>
            {shortTime(latest.at)}
          </text>
        )}
      </svg>
    </div>
  );
}

export default function PatientVitalsHistory({
  patientId,
  patientName,
  roomNumber,
  onClose,
}: {
  patientId: string;
  patientName: string;
  roomNumber: string | null;
  onClose: () => void;
}) {
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `loading` starts true, so nothing is set synchronously here. The cancel
    // flag keeps a slow response from a previous patient overwriting a newer one.
    let cancelled = false;
    (async () => {
      const data = await fetchFacultyVitalReadings({ patientId });
      if (cancelled) return;
      setReadings(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Close on Escape, matching the rest of the faculty modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The API returns newest-first; charts read left-to-right through time.
  const chronological = useMemo(() => [...readings].reverse(), [readings]);

  const series = useMemo(
    () =>
      METRICS.map((spec) => ({
        spec,
        points: chronological
          .map((r) => {
            const v = spec.read(r);
            return v === null ? null : { v, at: r.recorded_at, flagged: r.is_anomaly };
          })
          .filter((p): p is Point => p !== null),
      })).filter((s) => s.points.length > 0),
    [chronological],
  );

  const bpPoints = useMemo(
    () =>
      chronological
        .filter((r) => r.bp_systolic !== null)
        .map((r) => ({
          sys: r.bp_systolic as number,
          dia: r.bp_diastolic,
          at: r.recorded_at,
          flagged: r.is_anomaly,
        })),
    [chronological],
  );

  const flaggedCount = readings.filter((r) => r.is_anomaly).length;
  const hasTrends = series.length > 0 || bpPoints.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Vitals history for ${patientName}`}
      >
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">Vitals History</h2>
            <p className="truncate text-sm text-gray-500">
              {patientName}
              {roomNumber ? ` · ${roomNumber}` : ""} · {readings.length} reading
              {readings.length === 1 ? "" : "s"}
              {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close vitals history"
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[190px] animate-pulse rounded-xl bg-subtle" />
              ))}
            </div>
          ) : readings.length === 0 ? (
            <div className="p-12 text-center">
              <FontAwesomeIcon icon={faHeartbeat} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-700">No readings recorded</h3>
              <p className="mt-1 text-sm text-gray-500">
                No student has encoded vital signs for this patient yet.
              </p>
            </div>
          ) : (
            <>
              {hasTrends && (
                <section>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-700">Trends</h3>
                    <p className="text-[11px] text-gray-400">
                      Shaded band = typical adult range · amber point = flagged reading
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bpPoints.length > 0 && <BloodPressureTrend points={bpPoints} />}
                    {series.map((s) => (
                      <VitalTrend key={s.spec.key} spec={s.spec} points={s.points} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  All readings (newest first)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-hairline">
                  <table className="w-full">
                    <thead className="border-b border-gray-100 bg-subtle">
                      <tr>
                        {["Recorded", "Recorded by", "HR", "BP", "Temp", "RR", "SpO₂", "Pain", "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {readings.map((r) => (
                        <tr key={r.id} className="transition-colors hover:bg-subtle">
                          <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">
                            {new Date(r.recorded_at).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">
                            {r.users?.name ?? "Unknown"}
                          </td>
                          <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.heart_rate ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.bp_systolic !== null ? `${r.bp_systolic}/${r.bp_diastolic ?? "—"}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.temperature_c ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.respiratory_rate ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.oxygen_saturation ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
                            {r.pain_score ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.is_anomaly ? (
                              <span
                                className={`flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                                  r.anomaly_reasons.some((a) => a.severity === "critical")
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                                title={r.anomaly_reasons.map((a) => a.message).join(" · ")}
                              >
                                <FontAwesomeIcon icon={faExclamationTriangle} className="h-3 w-3" />
                                {r.anomaly_reasons.length} flag
                                {r.anomaly_reasons.length === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3" />
                                Normal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 bg-gray-50 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-all hover:bg-surface"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
