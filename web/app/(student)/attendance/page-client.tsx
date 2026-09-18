"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faPercent,
  faUserCheck,
  faUserXmark,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import { usePageData } from "../../lib/use-page-data";
import { fetchMyAttendance } from "../../lib/api";
import {
  SHIFT_ATTENDANCE_LABEL,
  SHIFT_ATTENDANCE_TONE,
  SHIFT_TYPE_LABEL,
  formatShiftTimeRange,
} from "../../lib/shifts";
import { EcgLoader } from "../../components/EcgLoader";

export default function StudentAttendanceClient() {
  const { data, loading } = usePageData("student:attendance", fetchMyAttendance);

  const rows = data?.shifts ?? [];
  const tally = data?.tally;

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 h-3.5" />, label: "Attendance" }}
        title="My Attendance"
        subtitle="Your clinical shifts and how your instructor recorded each one"
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={<FontAwesomeIcon icon={faPercent} className="h-5 w-5" />}
          value={tally?.rate == null ? "—" : `${tally.rate}%`}
          label="Attendance rate"
          caption="Present or late, of shifts marked"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faUserCheck} className="h-5 w-5" />}
          value={(tally?.present ?? 0) + (tally?.late ?? 0)}
          label="Shifts attended"
          caption={tally?.late ? `${tally.late} marked late` : undefined}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faUserXmark} className="h-5 w-5" />}
          value={tally?.absent ?? 0}
          label="Absences"
          caption={tally?.excused ? `${tally.excused} excused` : undefined}
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <EcgLoader size="lg" className="text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon icon={faCalendarCheck} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700">No shifts yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Your clinical shifts will appear here once your instructor schedules them.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
          <ul className="divide-y divide-hairline">
            {rows.map((row) => {
              const shift = row.shifts;
              const cancelled = shift?.status === "cancelled";
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${cancelled ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {shift?.label || (shift ? `${SHIFT_TYPE_LABEL[shift.shift_type]} shift` : "Shift")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {shift ? formatShiftTimeRange(shift) : "—"}
                      {shift?.room ? ` · ${shift.room.name}` : ""}
                      {row.checked_in_at &&
                        ` · in at ${new Date(row.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                  {cancelled ? (
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                      Cancelled
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SHIFT_ATTENDANCE_TONE[row.attendance_status]}`}
                    >
                      {SHIFT_ATTENDANCE_LABEL[row.attendance_status]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
