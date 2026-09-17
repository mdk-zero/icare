"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faHeartPulse,
  faTint,
  faFileLines,
  faFlask,
  faClockRotateLeft,
  faSpinner,
  faTriangleExclamation,
  faCircleCheck,
  faBed,
  faRightFromBracket,
  faRightToBracket,
  faUserPlus,
  faNotesMedical,
  faStethoscope,
  faChartLine,
  faFilePdf,
  faWandMagicSparkles,
  faSun,
  faMoon,
  faLocationDot,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "./PageHeader";
import Avatar from "./Avatar";
import PatientVitalsHistory from "./PatientVitalsHistory";
import { toast } from "./Toast";
import {
  fetchFacultyPatientDetail,
  generateFollowUps,
  reviewProgressNote,
  EhrRecord,
  EhrType,
  PatientChart as PatientChartData,
  PatientEvent,
  VitalReading,
} from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { summarizeAnomalyReasons } from "../lib/vitals/rules";

/**
 * One patient's chart: demographics, the vitals trend, TPR/IVF/notes, and the
 * admission timeline on a single screen — the "all in one dashboard per
 * patient" view, and the only route to a patient's records now that Patients,
 * Vitals Monitor and EHR Review have been folded into Monitoring.
 *
 * Charting itself stays with students; the one faculty write action here is
 * signing off a progress note, which moved from the retired EHR Review page.
 */

// ---------------------------------------------------------------------------
// Vitals trend
// ---------------------------------------------------------------------------

type VitalKey = "heart_rate" | "bp_systolic" | "temperature_c" | "respiratory_rate" | "oxygen_saturation";

type Level = "normal" | "warning" | "critical" | "none";

interface VitalSpec {
  key: VitalKey;
  label: string;
  unit: string;
  low: number;
  high: number;
  criticalLow?: number;
  criticalHigh?: number;
  /** Decimal places when rendering the value. */
  precision?: number;
}

/**
 * Mirrors app/lib/vitals/rules.ts, which is server/shared and keyed to the
 * charting form. Only the five vitals this dashboard trends are listed; the
 * thresholds are the same numbers so a tile and a flagged reading agree.
 */
const VITAL_SPECS: VitalSpec[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", low: 60, high: 100, criticalLow: 40, criticalHigh: 130 },
  { key: "bp_systolic", label: "Systolic BP", unit: "mmHg", low: 90, high: 140, criticalLow: 80, criticalHigh: 180 },
  { key: "temperature_c", label: "Temperature", unit: "°C", low: 36.1, high: 37.5, criticalLow: 35.0, criticalHigh: 39.5, precision: 1 },
  { key: "respiratory_rate", label: "Respiratory rate", unit: "/min", low: 12, high: 20, criticalLow: 8, criticalHigh: 30 },
  { key: "oxygen_saturation", label: "Oxygen saturation", unit: "%", low: 95, high: 100, criticalLow: 90 },
];

function levelFor(spec: VitalSpec, value: number | null | undefined): Level {
  if (value === null || value === undefined) return "none";
  if (spec.criticalLow !== undefined && value < spec.criticalLow) return "critical";
  if (spec.criticalHigh !== undefined && value > spec.criticalHigh) return "critical";
  if (value < spec.low || value > spec.high) return "warning";
  return "normal";
}

/** Status is stated in words as well as color — never color alone. */
function levelWord(spec: VitalSpec, value: number | null | undefined, level: Level): string {
  if (level === "none") return "Not recorded";
  if (level === "normal") return "Normal";
  const low = value! < spec.low;
  return level === "critical" ? (low ? "Critically low" : "Critically high") : low ? "Low" : "High";
}

const LEVEL_TEXT: Record<Level, string> = {
  none: "text-gray-400",
  normal: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-rose-700",
};

const LEVEL_CHIP: Record<Level, string> = {
  none: "bg-gray-100 text-gray-500 border-gray-200",
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

/** Newest-last series of at most `max` points for one vital. */
function seriesFor(readings: VitalReading[], key: VitalKey, max = 12): { value: number; at: string }[] {
  const points: { value: number; at: string }[] = [];
  // readings arrive newest-first; walk from the newest and reverse at the end.
  for (const reading of readings) {
    const value = reading[key];
    if (typeof value === "number") points.push({ value, at: reading.recorded_at });
    if (points.length === max) break;
  }
  return points.reverse();
}

/**
 * Compact trend for one vital. The line is recessive (it is context for the
 * current value beside it); only the latest point is accented, colored by the
 * status it reports. Per-point hit targets carry a native tooltip, so a value
 * can be read off the trend without a charting library.
 */
function Sparkline({
  points,
  spec,
  level,
}: {
  points: { value: number; at: string }[];
  spec: VitalSpec;
  level: Level;
}) {
  const W = 104;
  const H = 30;
  const PAD = 3;

  if (points.length < 2) {
    return (
      <div className="flex h-[30px] w-[104px] items-center justify-center rounded bg-subtle">
        <span className="text-[10px] text-gray-400">
          {points.length === 0 ? "No trend" : "1 reading"}
        </span>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  // Unchanging vitals are the common case (a stable patient charted hourly).
  // Scaling them normally divides by zero, and treating the span as 1 pins the
  // line to the floor — which reads as "bottomed out" rather than "steady", so
  // a flat series is drawn level through the middle instead.
  const y = (v: number) =>
    span === 0 ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1].value);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
      role="img"
      aria-label={`${spec.label} trend, last ${points.length} readings, ${min}${spec.unit} to ${max}${spec.unit}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-gray-300" />
      <circle cx={lastX} cy={lastY} r={3} className={LEVEL_TEXT[level]} fill="currentColor" />
      {points.map((p, i) => (
        <rect
          key={`${p.at}-${i}`}
          x={x(i) - (W - PAD * 2) / (points.length - 1) / 2}
          y={0}
          width={(W - PAD * 2) / (points.length - 1)}
          height={H}
          fill="transparent"
        >
          <title>{`${p.value}${spec.unit} · ${new Date(p.at).toLocaleString()}`}</title>
        </rect>
      ))}
    </svg>
  );
}

function VitalTile({ spec, readings }: { spec: VitalSpec; readings: VitalReading[] }) {
  const points = seriesFor(readings, spec.key);
  const latest = points.length > 0 ? points[points.length - 1].value : null;
  const level = levelFor(spec, latest);
  const previous = points.length > 1 ? points[points.length - 2].value : null;
  const delta = latest !== null && previous !== null ? latest - previous : null;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3.5 shadow-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{spec.label}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-slate-900">
              {latest === null ? "—" : latest.toFixed(spec.precision ?? 0)}
            </span>
            <span className="text-xs text-gray-500">{spec.unit}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_CHIP[level]}`}>
              {levelWord(spec, latest, level)}
            </span>
            {delta !== null && delta !== 0 && (
              <span className="font-mono text-[10px] text-gray-500">
                {delta > 0 ? "+" : ""}
                {delta.toFixed(spec.precision ?? 0)} since last
              </span>
            )}
          </p>
        </div>
        <Sparkline points={points} spec={spec} level={level} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const RECORD_TABS: { id: EhrType; label: string; icon: typeof faHeartPulse }[] = [
  { id: "tpr", label: "TPR Sheets", icon: faHeartPulse },
  { id: "ivf", label: "IVF Sheets", icon: faTint },
  { id: "note", label: "Progress Notes", icon: faFileLines },
];

/**
 * Structured record display for the TPR/IVF/note list — chips and a clearly
 * separate remarks paragraph, rather than one dense dot-joined line that
 * mixed the vitals, the free-text note, the student, and the timestamp
 * together (hard for a faculty member to scan at a glance).
 */

const SHIFT_STYLE: Record<string, { icon: typeof faSun; classes: string }> = {
  AM: { icon: faSun, classes: "bg-amber-50 text-amber-700 border-amber-200" },
  PM: { icon: faSun, classes: "bg-orange-50 text-orange-700 border-orange-200" },
  Night: { icon: faMoon, classes: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

const IVF_STATUS_STYLE: Record<string, string> = {
  ongoing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-gray-100 text-gray-600 border-gray-200",
  discontinued: "bg-rose-50 text-rose-700 border-rose-200",
};

function VitalChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
      {label && <span className="text-gray-400">{label}</span>}
      {value}
    </span>
  );
}

function TprSummary({ record }: { record: EhrRecord }) {
  const shiftStyle = record.shift ? SHIFT_STYLE[record.shift] : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {record.shift && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            shiftStyle?.classes ?? "border-gray-200 bg-gray-100 text-gray-600"
          }`}
        >
          <FontAwesomeIcon icon={shiftStyle?.icon ?? faSun} className="h-2.5 w-2.5" />
          {record.shift} shift
        </span>
      )}
      {record.temperature_c != null && <VitalChip label="T" value={`${record.temperature_c}°C`} />}
      {record.pulse != null && <VitalChip label="P" value={`${record.pulse}`} />}
      {record.respiration != null && <VitalChip label="R" value={`${record.respiration}`} />}
    </div>
  );
}

function IvfSummary({ record }: { record: EhrRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {record.solution && <span className="text-sm font-semibold text-gray-900">{record.solution}</span>}
      {record.volume_ml != null && <VitalChip label="" value={`${record.volume_ml} mL`} />}
      {record.rate_ml_hr != null && <VitalChip label="@" value={`${record.rate_ml_hr} mL/hr`} />}
      {record.site && (
        <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
          <FontAwesomeIcon icon={faLocationDot} className="h-2.5 w-2.5 text-gray-400" />
          {record.site}
        </span>
      )}
      {record.status && (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
            IVF_STATUS_STYLE[record.status] ?? "border-gray-200 bg-gray-100 text-gray-600"
          }`}
        >
          {record.status}
        </span>
      )}
    </div>
  );
}

const SOAP_LABELS: Record<string, string> = {
  S: "Subjective",
  O: "Objective",
  A: "Assessment",
  P: "Plan",
};

/**
 * Splits a SOAP-formatted note ("S: ... O: ... A: ... P: ...") into labeled
 * sections. Students write in the abbreviated clinical shorthand, which reads
 * as one dense, jargon-heavy paragraph; a faculty member scanning many notes
 * benefits from the same content broken into clearly labeled sections
 * instead. Returns null for a note that isn't in this format, so free-form
 * text still renders as a plain paragraph rather than being mangled.
 */
function parseSoapNote(content: string): { label: string; text: string }[] | null {
  const pattern = /(?:^|\n)\s*([SOAP]):\s*/g;
  const matches = [...content.matchAll(pattern)];
  if (matches.length < 2) return null;
  const sections: { label: string; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const text = content.slice(start, end).trim();
    if (text) sections.push({ label: SOAP_LABELS[match[1]], text });
  }
  return sections.length >= 2 ? sections : null;
}

function ProgressNoteBody({ content }: { content: string }) {
  if (!content) {
    return <p className="text-base text-gray-400">No content recorded.</p>;
  }
  const sections = parseSoapNote(content);
  if (!sections) {
    return <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-800">{content}</p>;
  }
  return (
    <div className="space-y-2.5">
      {sections.map((s) => (
        <p key={s.label} className="text-base leading-relaxed text-gray-800">
          <span className="mr-1.5 inline-block rounded bg-brand-600/10 px-2 py-0.5 align-middle text-xs font-bold uppercase tracking-wide text-brand-700">
            {s.label}:
          </span>
          {s.text}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const EVENT_ICON: Record<string, typeof faHeartPulse> = {
  "patient.create": faUserPlus,
  "patient.check_in": faRightToBracket,
  "patient.check_out": faRightFromBracket,
};

const EVENT_LABEL: Record<string, string> = {
  "patient.create": "Admitted",
  "patient.check_in": "Checked in",
  "patient.check_out": "Checked out",
};

function eventDetail(event: PatientEvent): string | null {
  const room = event.details.to_room ?? event.details.from_room ?? event.details.room;
  return typeof room === "string" && room ? room : null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole days between admission and discharge (or now, while admitted). */
function lengthOfStay(chart: PatientChartData): string {
  const start = chart.patient.admission_date ? new Date(chart.patient.admission_date) : null;
  if (!start || Number.isNaN(start.getTime())) return "—";
  const end = chart.patient.discharged_at ? new Date(chart.patient.discharged_at) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
  return days === 1 ? "1 day" : `${days} days`;
}

export default function PatientChart({
  backHref,
  backLabel = "All patients",
}: {
  backHref: string;
  /** Names the destination, which differs per portal. */
  backLabel?: string;
}) {
  const params = useParams<{ id: string }>();
  const patientId = params?.id ?? "";
  const [tab, setTab] = useState<EhrType>("tpr");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);

  const {
    data: chart,
    loading,
    refresh,
  } = usePageData(`faculty:patient:${patientId}`, () => fetchFacultyPatientDetail(patientId));

  const handleDraftFollowUps = async (summaryId: string) => {
    setDraftingId(summaryId);
    const result = await generateFollowUps(summaryId);
    setDraftingId(null);
    if (result.error || !result.summary) {
      toast(result.error ?? "Unable to generate recommendations");
      return;
    }
    const count = result.summary.follow_up.length;
    await refresh();
    toast(`Drafted ${count} follow-up recommendation${count === 1 ? "" : "s"}`);
  };

  /**
   * Faculty sign-off on a student's progress note — the one write action in the
   * clinical cluster, and the trigger for the student's "reviewed" notification.
   * It lives here because the chart is now the only route to a patient's notes.
   */
  const handleReview = async (noteId: string) => {
    setReviewingId(noteId);
    const result = await reviewProgressNote(noteId);
    setReviewingId(null);
    if (result.error) {
      toast(result.error);
      return;
    }
    await refresh();
    toast("Progress note marked reviewed");
  };

  const records = useMemo<EhrRecord[]>(() => {
    if (!chart) return [];
    return tab === "tpr" ? chart.tpr : tab === "ivf" ? chart.ivf : chart.notes;
  }, [chart, tab]);

  const flaggedCount = chart?.vitals.filter((r) => r.is_anomaly).length ?? 0;
  const summaries = chart?.discharge_summaries ?? [];

  // The most recent flagged readings, with their stored reasons parsed back
  // out of JSONB. Capped because this sits above the trend, and an unreviewed
  // patient can accumulate a long tail of them.
  const flagged = useMemo(
    () =>
      (chart?.vitals ?? [])
        .filter((r) => r.is_anomaly)
        .slice(0, 3)
        .map((reading) => ({ reading, reasons: summarizeAnomalyReasons(reading.anomaly_reasons) }))
        .filter(({ reasons }) => reasons.all.length > 0),
    [chart],
  );
  const unreviewedNotes = chart?.notes.filter((n) => !n.reviewed_at).length ?? 0;
  const activeIvf = chart?.ivf.filter((r) => r.status === "ongoing").length ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (!chart) {
    return (
      <div>
        <BackLink href={backHref} label={backLabel} />
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon icon={faBed} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700">Patient not found</h3>
          <p className="mt-1 text-sm text-gray-500">
            This record may have been deleted. Return to the patient list to pick another.
          </p>
        </div>
      </div>
    );
  }

  const { patient } = chart;
  const discharged = patient.status === "discharged";
  const roomLabel = patient.room ? `${patient.room.name} · Room ${patient.room.room_number}` : null;
  const labs = Object.entries(patient.labs ?? {});

  return (
    <div>
      <BackLink href={backHref} label={backLabel} />

      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faStethoscope} className="h-3.5 w-3.5" />, label: "Patient Chart" }}
        title={patient.name}
        subtitle={[
          patient.age != null ? `${patient.age} years old` : null,
          patient.gender,
          patient.diagnosis,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {/* Identity strip: the facts a clinician checks before reading anything else. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-tile">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            discharged
              ? "border-gray-200 bg-gray-100 text-gray-600"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <FontAwesomeIcon icon={discharged ? faRightFromBracket : faCircleCheck} className="h-3 w-3" />
          {discharged ? "Discharged" : "Admitted"}
        </span>
        <Fact label="Room" value={discharged ? "—" : (roomLabel ?? "Unassigned")} />
        <Fact label="Admitted" value={formatDate(patient.admission_date)} />
        {discharged && <Fact label="Discharged" value={formatDate(patient.discharged_at)} />}
        <Fact label="Length of stay" value={lengthOfStay(chart)} />
        <Fact label="Record ID" value={patient.mimic_id} mono />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Vitals: current value + trend per sign, then the readings behind them. */}
          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-gray-900">
                <FontAwesomeIcon icon={faHeartPulse} className="h-4 w-4 text-rose-500" />
                Vital Signs
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {chart.vitals.length === 0
                    ? "No readings charted"
                    : `${chart.vitals.length} reading${chart.vitals.length === 1 ? "" : "s"}${
                        flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""
                      }`}
                </span>
                {/* The charted history the retired Vitals Monitor page carried:
                    per-metric lines against their reference bands. */}
                {chart.vitals.length > 0 && (
                  <button
                    onClick={() => setHistoryOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-brand-600/40 hover:text-brand-700"
                  >
                    <FontAwesomeIcon icon={faChartLine} className="h-3 w-3" />
                    Full history
                  </button>
                )}
              </div>
            </div>

            {flagged.length > 0 && (
              <div className="mb-3 space-y-2">
                {flagged.map(({ reading, reasons }) => (
                  <div
                    key={reading.id}
                    className={`rounded-xl border p-3 ${
                      reasons.critical
                        ? "border-rose-200 bg-rose-50/60"
                        : "border-amber-200 bg-amber-50/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          reasons.critical
                            ? "bg-rose-600 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
                        {reasons.critical ? "Critical" : "Out of range"}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatDate(reading.recorded_at)}
                        {reading.users?.name ? ` · ${reading.users.name}` : ""}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {reasons.all.map((reason, i) => (
                        <li key={`${reading.id}-${i}`}>
                          <p className="text-sm font-medium text-gray-900">{reason.message}</p>
                          {reason.recommendation && (
                            <p className="mt-0.5 text-xs leading-relaxed text-gray-700">
                              <span className="font-semibold">Recommended: </span>
                              {reason.recommendation}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {VITAL_SPECS.map((spec) => (
                <VitalTile key={spec.key} spec={spec} readings={chart.vitals} />
              ))}
            </div>

            {chart.vitals.length > 0 && (
              <details className="mt-4 group">
                <summary className="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700">
                  Show the {Math.min(chart.vitals.length, 20)} most recent readings
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-subtle">
                      <tr>
                        {["Recorded", "HR", "BP", "Temp", "RR", "SpO₂", "By"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {chart.vitals.slice(0, 20).map((reading) => (
                        <tr key={reading.id} className={reading.is_anomaly ? "bg-rose-50/40" : undefined}>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                            <span className="flex items-center gap-1.5">
                              {reading.is_anomaly && (
                                <FontAwesomeIcon
                                  icon={faTriangleExclamation}
                                  title="Flagged by the vitals rules"
                                  className="h-3 w-3 text-rose-500"
                                />
                              )}
                              {formatDate(reading.recorded_at)}
                            </span>
                          </td>
                          <td className="tabular px-3 py-2 text-gray-700">{reading.heart_rate ?? "—"}</td>
                          <td className="tabular px-3 py-2 text-gray-700">
                            {reading.bp_systolic != null && reading.bp_diastolic != null
                              ? `${reading.bp_systolic}/${reading.bp_diastolic}`
                              : "—"}
                          </td>
                          <td className="tabular px-3 py-2 text-gray-700">{reading.temperature_c ?? "—"}</td>
                          <td className="tabular px-3 py-2 text-gray-700">{reading.respiratory_rate ?? "—"}</td>
                          <td className="tabular px-3 py-2 text-gray-700">{reading.oxygen_saturation ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{reading.users?.name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5 lg:h-full">
          {/* Only a discharged patient has one; the newest stay leads. */}
          {discharged && (
            <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-gray-900">
                <FontAwesomeIcon icon={faFileLines} className="h-4 w-4 text-brand-600" />
                Discharge Summary
              </h2>

              {summaries.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No discharge summary was recorded for this stay. Summaries are written
                  automatically at check-out.
                </p>
              ) : (
                <div className="space-y-4">
                  {summaries.map((summary, index) => (
                    <div
                      key={summary.id}
                      className={index > 0 ? "border-t border-hairline pt-4" : undefined}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">
                          Discharged {formatDate(summary.discharged_at)}
                        </p>
                        <a
                          href={`/api/faculty/reports/discharge?id=${summary.id}&format=pdf`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-brand-600/40 hover:text-brand-700"
                        >
                          <FontAwesomeIcon icon={faFilePdf} className="h-3 w-3" />
                          PDF
                        </a>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {summary.diagnosis || "No diagnosis recorded"}
                        {summary.room_label ? ` · ${summary.room_label}` : ""}
                      </p>

                      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: "Readings", value: summary.vitals_digest?.readings ?? 0 },
                          { label: "Flagged", value: summary.vitals_digest?.flagged ?? 0 },
                          { label: "Notes", value: summary.ehr_digest?.notes ?? 0 },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-lg bg-subtle py-1.5">
                            <dt className="text-[10px] uppercase tracking-wide text-gray-500">
                              {stat.label}
                            </dt>
                            <dd className="tabular text-sm font-semibold text-gray-900">
                              {stat.value}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      {(summary.ehr_digest?.ivf_ongoing ?? 0) > 0 && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                          {summary.ehr_digest.ivf_ongoing} IVF line(s) were still running at
                          discharge.
                        </p>
                      )}

                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Follow-up recommendations
                        </p>
                        {summary.follow_up.length === 0 ? (
                          <div className="mt-1.5">
                            <p className="text-sm text-gray-400">Not drafted yet.</p>
                            <button
                              onClick={() => handleDraftFollowUps(summary.id)}
                              disabled={draftingId === summary.id}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                            >
                              <FontAwesomeIcon
                                icon={draftingId === summary.id ? faSpinner : faWandMagicSparkles}
                                spin={draftingId === summary.id}
                                className="h-3 w-3"
                              />
                              {draftingId === summary.id ? "Drafting..." : "Draft with AI"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <ol className="mt-1.5 space-y-2">
                              {summary.follow_up.map((item, i) => (
                                <li key={i} className="text-sm">
                                  <span className="font-medium text-gray-900">{item.title}</span>
                                  <p className="text-xs leading-relaxed text-gray-600">
                                    {item.detail}
                                  </p>
                                </li>
                              ))}
                            </ol>
                            <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
                              AI-drafted from this stay&apos;s recorded data — review before sharing
                              with students.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-gray-900">
              <FontAwesomeIcon icon={faNotesMedical} className="h-4 w-4 text-brand-600" />
              Clinical Record
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-gray-500">Diagnosis</dt>
                <dd className="mt-0.5 text-gray-800">{patient.diagnosis || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Medical history</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-gray-800">
                  {patient.medical_history || "No history recorded."}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-gray-900">
              <FontAwesomeIcon icon={faFlask} className="h-4 w-4 text-purple-600" />
              Laboratory
            </h2>
            {labs.length === 0 ? (
              <p className="text-sm text-gray-400">No lab results on file.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {labs.map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="truncate text-xs text-gray-500">{key.replace(/_/g, " ")}</dt>
                    <dd className="tabular truncate font-medium text-gray-800">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface p-4 shadow-tile lg:flex-1">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-gray-900">
              <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4 text-gray-500" />
              Admission History
            </h2>
            {chart.events.length === 0 ? (
              <p className="text-sm text-gray-400">
                No admission events recorded. Events appear here from the first check-in onward.
              </p>
            ) : (
              <ol className="max-h-72 space-y-3 overflow-y-auto pr-1 custom-scrollbar lg:max-h-none lg:min-h-0 lg:flex-1">
                {chart.events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
                      <FontAwesomeIcon icon={EVENT_ICON[event.action] ?? faClockRotateLeft} className="h-3 w-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {EVENT_LABEL[event.action] ?? event.action}
                        {eventDetail(event) && (
                          <span className="font-normal text-gray-500"> · {eventDetail(event)}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(event.created_at)} · {event.actor_name}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {/* Clinical documentation: the three sheets students chart against.
          Full width of its own — the vitals+sidebar row above it is the only
          part of this page that needs the two-column split. */}
      <section className="mt-5 rounded-xl border border-hairline bg-surface shadow-tile">
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline p-2">
          {RECORD_TABS.map((t) => {
            const count = t.id === "tpr" ? chart.tpr.length : t.id === "ivf" ? chart.ivf.length : chart.notes.length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-base font-medium transition-colors ${
                  tab === t.id ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <FontAwesomeIcon icon={t.icon} className="h-4 w-4" />
                {t.label}
                <span className={`rounded-full px-1.5 text-xs ${tab === t.id ? "bg-white/20" : "bg-gray-100"}`}>
                  {count}
                </span>
              </button>
            );
          })}
          {(activeIvf > 0 || unreviewedNotes > 0) && (
            <span className="ml-auto flex items-center gap-2 pr-2 text-[11px] text-gray-500">
              {activeIvf > 0 && <span>{activeIvf} IVF running</span>}
              {unreviewedNotes > 0 && <span>{unreviewedNotes} note{unreviewedNotes === 1 ? "" : "s"} to review</span>}
            </span>
          )}
        </div>

        {records.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            No {tab === "tpr" ? "TPR sheets" : tab === "ivf" ? "IVF sheets" : "progress notes"} charted for this
            patient.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {records.map((record) => (
              <li key={record.id} className="px-4 py-3.5">
                {/* Comment-style header: who and when lead, same as the rest
                    of the app's activity feeds — a faculty member scanning
                    many entries needs that before the clinical detail. */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={record.users?.name} size="sm" tone="brand" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {record.users?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(record.created_at)}</p>
                    </div>
                  </div>
                  {tab === "note" &&
                    (record.reviewed_at ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" />
                        Reviewed
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReview(record.id)}
                        disabled={reviewingId === record.id}
                        title="Mark this note reviewed and notify the student"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-60"
                      >
                        {reviewingId === record.id ? (
                          <FontAwesomeIcon icon={faSpinner} spin className="h-2.5 w-2.5" />
                        ) : (
                          <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" />
                        )}
                        {reviewingId === record.id ? "Saving..." : "Mark reviewed"}
                      </button>
                    ))}
                </div>

                <div className="mt-2.5 space-y-1.5 pl-10">
                  {tab === "tpr" && <TprSummary record={record} />}
                  {tab === "ivf" && <IvfSummary record={record} />}
                  {tab === "note" && <ProgressNoteBody content={record.content ?? ""} />}
                  {tab !== "note" && record.remarks && (
                    <p className="text-sm leading-relaxed text-gray-700">{record.remarks}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historyOpen && (
        <PatientVitalsHistory
          patientId={patient.id}
          patientName={patient.name}
          roomNumber={patient.room_number || null}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className={`block truncate text-sm text-gray-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </span>
  );
}
