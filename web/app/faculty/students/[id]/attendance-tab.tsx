"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faFilePrescription,
  faListCheck,
  faStethoscope,
  faXmark,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { usePageData } from "../../../lib/use-page-data";
import { excuseAbsence, fetchStudentAttendance, undoExcuse } from "../../../lib/api";
import {
  ATTENDANCE_LABEL,
  EXCUSES_NEED_MIGRATION,
  MAX_EXCUSE_REASON,
  tallyAttendance,
  type ActivityKind,
  type AttendanceRow,
  type AttendanceStatus,
} from "../../../lib/attendance";
import { toast } from "../../../components/Toast";
import { EcgLoader } from "../../../components/EcgLoader";

/** One student's attendance, shared by the tile and the tab. */
export function useStudentAttendance(studentId: string) {
  return usePageData(`faculty:student-attendance:${studentId}`, () => fetchStudentAttendance(studentId));
}

const KIND: Record<ActivityKind, { label: string; icon: IconDefinition }> = {
  scenario: { label: "RetDem", icon: faStethoscope },
  assessment: { label: "Quiz", icon: faListCheck },
  case_presentation: { label: "Case Presentation", icon: faFilePrescription },
};

const CHIP: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  absent: "bg-rose-50 text-rose-700",
  excused: "bg-slate-100 text-slate-700",
  upcoming: "bg-sky-50 text-sky-700",
  no_deadline: "bg-gray-100 text-gray-600",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const sameRow = (a: AttendanceRow, b: AttendanceRow) => a.kind === b.kind && a.activity_id === b.activity_id;

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Attendance from deadlines: every RetDem, Quiz and Case Presentation the
 * student was given, Present when done by its deadline, Late after it, Absent
 * when it passed with nothing done. The instructor of the student's group can
 * excuse an absence, with a reason.
 */
export default function AttendanceTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { data, loading, setData } = useStudentAttendance(studentId);
  const attendance = data?.data;
  const [excusing, setExcusing] = useState<AttendanceRow | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-subtle" aria-hidden />;
  if (data?.error || !attendance) return <p className="py-8 text-center text-gray-500">{data?.error ?? "Unable to load attendance"}</p>;

  const replace = (row: AttendanceRow | null, was: AttendanceRow) =>
    setData((prev) => {
      if (!prev?.data) return prev!;
      const rows = prev.data.rows.map((r) => (sameRow(r, was) && row ? row : r));
      return { data: { ...prev.data, rows, tally: tallyAttendance(rows.map((r) => r.status)) } };
    });

  const undo = async (row: AttendanceRow) => {
    setUndoing(row.activity_id);
    const res = await undoExcuse(studentId, { kind: row.kind, activity_id: row.activity_id });
    setUndoing(null);
    if (res.error !== undefined) return toast(res.error);
    replace(res.data.row, row);
    toast("Excuse removed");
  };

  const { rows, tally } = attendance;
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <FontAwesomeIcon icon={faCalendarCheck} className="mb-3 h-7 w-7 text-gray-300" />
        <p className="text-gray-500">No RetDems, quizzes or case presentations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["present", "late", "absent", "excused"] as const).map((s) => (
          <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[s]}`}>
            {ATTENDANCE_LABEL[s]} {tally[s]}
          </span>
        ))}
        <span className="ml-auto text-sm text-gray-500">
          {tally.rate === null ? "Nothing past its deadline yet" : `${tally.rate}% attended`}
        </span>
      </div>

      <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
        {rows.map((r) => {
          const kind = KIND[r.kind];
          return (
            <li key={`${r.kind}:${r.activity_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={kind.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {r.title} <span className="font-normal text-gray-400">· {kind.label}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {r.deadline ? `Due ${when(r.deadline)}` : "No deadline"}
                  {r.done_at && ` · Done ${when(r.done_at)}`}
                </p>
                {r.excuse && (
                  <p className="mt-0.5 break-words text-xs text-gray-500">
                    Excused{r.excuse.by_name ? ` by ${r.excuse.by_name}` : ""}: {r.excuse.reason}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[r.status]}`}>
                {ATTENDANCE_LABEL[r.status]}
              </span>
              {attendance.can_excuse && r.status === "absent" && (
                <button
                  type="button"
                  onClick={() => setExcusing(r)}
                  disabled={!attendance.excuses_ready}
                  title={attendance.excuses_ready ? undefined : EXCUSES_NEED_MIGRATION}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Excuse
                </button>
              )}
              {attendance.can_excuse && r.status === "excused" && (
                <button
                  type="button"
                  onClick={() => undo(r)}
                  disabled={undoing === r.activity_id}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {excusing && (
        <ExcuseDialog
          row={excusing}
          studentId={studentId}
          studentName={studentName}
          onClose={() => setExcusing(null)}
          onSaved={(row) => {
            replace(row, excusing);
            setExcusing(null);
            toast("Absence excused");
          }}
        />
      )}
    </div>
  );
}

function ExcuseDialog({
  row,
  studentId,
  studentName,
  onClose,
  onSaved,
}: {
  row: AttendanceRow;
  studentId: string;
  studentName: string;
  onClose: () => void;
  onSaved: (row: AttendanceRow | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await excuseAbsence(studentId, { kind: row.kind, activity_id: row.activity_id, reason: reason.trim() });
    setSaving(false);
    if (res.error !== undefined) return setError(res.error);
    onSaved(res.data.row);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="excuse-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="min-w-0">
            <h2 id="excuse-title" className="truncate font-display text-lg font-semibold text-gray-900">
              Excuse the absence
            </h2>
            <p className="truncate text-sm text-gray-500">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) save();
          }}
        >
          <div className="text-sm">
            <p className="font-semibold text-gray-800">{row.title}</p>
            <p className="text-gray-500">{row.deadline ? `Due ${when(row.deadline)}` : "No deadline"} · nothing done by then</p>
          </div>
          <div>
            <label htmlFor="excuse-reason" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="excuse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_EXCUSE_REASON}
              rows={3}
              required
              autoFocus
              disabled={saving}
              placeholder="Medical certificate submitted."
              className={`${inputClass} resize-y`}
            />
          </div>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !reason.trim()}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <EcgLoader />}
              Excuse
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
