"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faPlus,
  faSpinner,
  faTimes,
  faArrowLeft,
  faUserCheck,
  faTrash,
  faBan,
  faRotateLeft,
  faUsers,
  faPercent,
  faClipboardList,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import ConfirmModal, { type ConfirmConfig } from "../../components/ConfirmModal";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import {
  fetchShifts,
  fetchShiftRoster,
  createShift,
  updateShift,
  deleteShift,
  fetchSections,
  fetchRooms,
  type FacultyShift,
  type ShiftRosterEntry,
  type Section,
  type Room,
} from "../../lib/api";
import {
  SHIFT_ATTENDANCE_LABEL,
  SHIFT_ATTENDANCE_TONE,
  SHIFT_PHASE_LABEL,
  SHIFT_PHASE_TONE,
  SHIFT_TYPE_LABEL,
  formatShiftTimeRange,
  shiftPhase,
  shiftTitle,
  shiftWindowFromPreset,
  tallyAttendance,
  type ShiftAttendanceStatus,
  type ShiftType,
} from "../../lib/shifts";

const NO_SHIFTS: FacultyShift[] = [];
const NO_SECTIONS: Section[] = [];
const NO_ROOMS: Room[] = [];

/** The statuses a roster row can be set to, in the order faculty use them. */
const MARKABLE: ShiftAttendanceStatus[] = ["present", "late", "absent", "excused"];

const inputClass =
  "w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600";
const labelClass = "block text-xs font-medium text-gray-600 mb-1";

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AttendanceClient() {
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const { data, loading, refresh } = usePageData("faculty:attendance", async () => {
    const [shifts, sections, rooms] = await Promise.all([
      fetchShifts(),
      fetchSections(),
      fetchRooms(),
    ]);
    return { shifts, sections, rooms };
  });

  const shifts = data?.shifts ?? NO_SHIFTS;
  const sections = data?.sections ?? NO_SECTIONS;
  const rooms = data?.rooms ?? NO_ROOMS;

  // Headline numbers read across every shift on screen, so a single shift's
  // roster cannot disagree with the tiles above it.
  const overall = useMemo(
    () => tallyAttendance(shifts.flatMap((s) => s.statuses)),
    [shifts],
  );
  const unmarked = useMemo(
    () =>
      shifts.filter(
        (s) =>
          s.status !== "cancelled" &&
          shiftPhase(s) === "past" &&
          s.statuses.some((v) => v === "scheduled"),
      ).length,
    [shifts],
  );

  const handleDelete = async (shift: FacultyShift) => {
    setConfirm((prev) => (prev ? { ...prev, loading: true, error: null } : null));
    const result = await deleteShift(shift.id);
    if (result.error) {
      setConfirm((prev) => (prev ? { ...prev, loading: false, error: result.error } : null));
      return;
    }
    setConfirm(null);
    if (openShiftId === shift.id) setOpenShiftId(null);
    await refresh();
    toast("Shift deleted");
  };

  if (openShiftId) {
    return (
      <ShiftRoster
        shiftId={openShiftId}
        onBack={() => setOpenShiftId(null)}
        onChanged={refresh}
      />
    );
  }

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 h-3.5" />, label: "Attendance" }}
        title="Attendance"
        subtitle="Schedule clinical shifts and record who turned up for them"
        action={{
          icon: <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />,
          onClick: () => setFormOpen(true),
          label: "Schedule a new shift for one of your sections",
          text: "Schedule shift",
        }}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faClipboardList} className="h-5 w-5" />}
          value={shifts.length}
          label="Shifts scheduled"
          caption={unmarked > 0 ? `${unmarked} past shift${unmarked === 1 ? "" : "s"} unmarked` : undefined}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faPercent} className="h-5 w-5" />}
          value={overall.rate === null ? "—" : `${overall.rate}%`}
          label="Attendance rate"
          caption="Present or late, of those marked"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faUserCheck} className="h-5 w-5" />}
          value={overall.present + overall.late}
          label="Attended"
          caption={overall.late > 0 ? `${overall.late} late` : undefined}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faUsers} className="h-5 w-5" />}
          value={overall.absent}
          label="Absent"
          caption={overall.excused > 0 ? `${overall.excused} excused separately` : undefined}
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-brand-600" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon icon={faCalendarCheck} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700">No shifts scheduled yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Schedule a shift for one of your sections — every student in it is rostered
            automatically, ready to be marked.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
          <table className="w-full">
            <thead className="border-b border-gray-100 bg-subtle">
              <tr>
                {["Shift", "Section", "When", "Attendance", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {shifts.map((shift) => {
                const phase = shiftPhase(shift);
                const tally = tallyAttendance(shift.statuses);
                return (
                  <tr key={shift.id} className="transition-colors hover:bg-subtle">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setOpenShiftId(shift.id)}
                        className="text-left font-semibold text-gray-900 hover:text-brand-700"
                      >
                        {shiftTitle(shift)}
                      </button>
                      <p className="mt-0.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SHIFT_PHASE_TONE[phase]}`}
                        >
                          {SHIFT_PHASE_LABEL[phase]}
                        </span>
                        {shift.room && (
                          <span className="ml-1.5 text-xs text-gray-500">{shift.room.name}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{shift.section?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatShiftTimeRange(shift)}
                    </td>
                    <td className="px-4 py-3">
                      {tally.total === 0 ? (
                        <span className="text-xs text-gray-400">No students rostered</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="tabular text-sm font-semibold text-gray-900">
                            {tally.rate === null ? "—" : `${tally.rate}%`}
                          </span>
                          <span className="text-xs text-gray-500">
                            {tally.present + tally.late}/{tally.present + tally.late + tally.absent || tally.total}
                          </span>
                          {tally.scheduled > 0 && (
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {tally.scheduled} unmarked
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setOpenShiftId(shift.id)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-600/10"
                        >
                          Mark attendance
                        </button>
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "Delete Shift",
                              message: `Delete ${shiftTitle(shift)}? Its attendance records are deleted with it.`,
                              confirmLabel: "Delete",
                              danger: true,
                              loading: false,
                              error: null,
                              onConfirm: () => handleDelete(shift),
                            })
                          }
                          title="Delete shift"
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <ScheduleShiftModal
          sections={sections}
          rooms={rooms}
          onClose={() => setFormOpen(false)}
          onCreated={async (assigned) => {
            setFormOpen(false);
            await refresh();
            toast(
              assigned > 0
                ? `Shift scheduled — ${assigned} student${assigned === 1 ? "" : "s"} rostered`
                : "Shift scheduled — no students in that section yet",
            );
          }}
        />
      )}

      {confirm && (
        <ConfirmModal config={confirm} onClose={() => !confirm.loading && setConfirm(null)} />
      )}
    </div>
  );
}

function ScheduleShiftModal({
  sections,
  rooms,
  onClose,
  onCreated,
}: {
  sections: Section[];
  rooms: Room[];
  onClose: () => void;
  onCreated: (assigned: number) => void;
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [shiftType, setShiftType] = useState<ShiftType>("am");
  const [date, setDate] = useState(todayISO());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [roomId, setRoomId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let window: { starts_at: string; ends_at: string } | null;
    if (shiftType === "custom") {
      if (!customStart || !customEnd) {
        setError("A custom shift needs a start and an end time.");
        return;
      }
      window = { starts_at: new Date(customStart).toISOString(), ends_at: new Date(customEnd).toISOString() };
    } else {
      window = shiftWindowFromPreset(date, shiftType);
    }
    if (!window) {
      setError("That date is not valid.");
      return;
    }
    if (new Date(window.ends_at) <= new Date(window.starts_at)) {
      setError("The shift must end after it starts.");
      return;
    }
    if (!sectionId) {
      setError("Pick a section to roster.");
      return;
    }

    setSaving(true);
    const result = await createShift({
      section_id: sectionId,
      shift_type: shiftType,
      starts_at: window.starts_at,
      ends_at: window.ends_at,
      room_id: roomId || null,
      label: label.trim() || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated(result.assigned ?? 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between border-b border-hairline bg-subtle p-4">
          <h2 className="text-lg font-bold text-gray-900">Schedule Shift</h2>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-200">
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 p-4">
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <div>
            <label className={labelClass}>Section</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
              {sections.length === 0 && <option value="">No sections available</option>}
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Every student in the section is rostered onto the shift.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Rotation</label>
              <select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value as ShiftType)}
                className={inputClass}
              >
                {(["am", "pm", "night", "custom"] as ShiftType[]).map((t) => (
                  <option key={t} value={t}>
                    {SHIFT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            {shiftType !== "custom" && (
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {shiftType === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Starts</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ends</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-gray-600">
              {SHIFT_TYPE_LABEL[shiftType]} rotation
              {(() => {
                const w = shiftWindowFromPreset(date, shiftType as Exclude<ShiftType, "custom">);
                return w ? ` · ${formatShiftTimeRange(w)}` : "";
              })()}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Room (optional)</label>
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputClass}>
                <option value="">Ward-wide</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Week 3 rotation"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-hairline pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || sections.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShiftRoster({
  shiftId,
  onBack,
  onChanged,
}: {
  shiftId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const { data, loading, refresh } = usePageData(`faculty:shift:${shiftId}`, () =>
    fetchShiftRoster(shiftId),
  );

  const shift = data?.shift;
  const roster = useMemo<ShiftRosterEntry[]>(() => data?.roster ?? [], [data]);
  const tally = useMemo(
    () => tallyAttendance(roster.map((r) => r.attendance_status)),
    [roster],
  );

  const mark = async (entry: ShiftRosterEntry, status: ShiftAttendanceStatus) => {
    setSavingId(entry.id);
    const result = await updateShift(shiftId, {
      marks: [{ assignment_id: entry.id, status }],
    });
    setSavingId(null);
    if (result.error) {
      toast(result.error);
      return;
    }
    await refresh();
    onChanged();
  };

  const markAllPresent = async () => {
    const pending = roster.filter((r) => r.attendance_status === "scheduled");
    if (pending.length === 0) return;
    setBulkSaving(true);
    const result = await updateShift(shiftId, {
      marks: pending.map((r) => ({ assignment_id: r.id, status: "present" as const })),
    });
    setBulkSaving(false);
    if (result.error) {
      toast(result.error);
      return;
    }
    await refresh();
    onChanged();
    toast(`Marked ${result.updated ?? pending.length} present`);
  };

  const toggleCancelled = async () => {
    if (!shift) return;
    const next = shift.status === "cancelled" ? "scheduled" : "cancelled";
    const result = await updateShift(shiftId, { status: next });
    if (result.error) {
      toast(result.error);
      return;
    }
    await refresh();
    onChanged();
    toast(next === "cancelled" ? "Shift cancelled" : "Shift reinstated");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div>
        <BackButton onBack={onBack} />
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <h3 className="text-lg font-semibold text-gray-700">Shift not found</h3>
        </div>
      </div>
    );
  }

  const phase = shiftPhase(shift);

  return (
    <div>
      <BackButton onBack={onBack} />

      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 h-3.5" />, label: "Attendance" }}
        title={shiftTitle(shift)}
        subtitle={`${shift.section?.name ?? "No section"} · ${formatShiftTimeRange(shift)}${
          shift.room ? ` · ${shift.room.name}` : ""
        }`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${SHIFT_PHASE_TONE[phase]}`}
        >
          {SHIFT_PHASE_LABEL[phase]}
        </span>
        <span className="text-sm text-gray-600">
          {tally.rate === null ? "Not yet marked" : `${tally.rate}% attendance`}
          {tally.scheduled > 0 && ` · ${tally.scheduled} unmarked`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={markAllPresent}
            disabled={bulkSaving || tally.scheduled === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            {bulkSaving ? (
              <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faUserCheck} className="h-3.5 w-3.5" />
            )}
            Mark all present
          </button>
          <button
            onClick={toggleCancelled}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <FontAwesomeIcon
              icon={shift.status === "cancelled" ? faRotateLeft : faBan}
              className="h-3.5 w-3.5"
            />
            {shift.status === "cancelled" ? "Reinstate" : "Cancel shift"}
          </button>
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon icon={faUsers} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700">No students rostered</h3>
          <p className="mt-1 text-sm text-gray-500">
            This section had no students when the shift was created.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
          <ul className="divide-y divide-hairline">
            {roster.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{entry.users?.name ?? "Unknown student"}</p>
                  <p className="text-xs text-gray-500">
                    {entry.users?.email ?? ""}
                    {entry.checked_in_at &&
                      ` · in at ${new Date(entry.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SHIFT_ATTENDANCE_TONE[entry.attendance_status]}`}
                >
                  {SHIFT_ATTENDANCE_LABEL[entry.attendance_status]}
                </span>

                <div className="flex items-center gap-1">
                  {savingId === entry.id ? (
                    <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4 text-brand-600" />
                  ) : (
                    MARKABLE.map((status) => (
                      <button
                        key={status}
                        onClick={() => mark(entry, status)}
                        aria-pressed={entry.attendance_status === status}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                          entry.attendance_status === status
                            ? SHIFT_ATTENDANCE_TONE[status]
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {SHIFT_ATTENDANCE_LABEL[status]}
                      </button>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
      All shifts
    </button>
  );
}
