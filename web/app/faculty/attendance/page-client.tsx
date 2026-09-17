"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faChevronLeft,
  faChevronRight,
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
        onDelete={(shift) =>
          setConfirm({
            title: "Delete this shift?",
            message: `${shiftTitle(shift)} on ${formatShiftTimeRange(shift)} and its roster will be removed. Cancelling the shift instead keeps the record.`,
            confirmLabel: "Delete shift",
            danger: true,
            onConfirm: () => handleDelete(shift),
          })
        }
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
        <ShiftCalendar shifts={shifts} onOpen={setOpenShiftId} />
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


// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Earliest and latest hour the week grid draws, in local time. */
const GRID_START_HOUR = 5;
const GRID_END_HOUR = 23;
const HOUR_ROW_PX = 44;

type CalendarView = "month" | "week";

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Sunday on or before `d`, which is where both grids begin. */
function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -startOfDay(d).getDay());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Colour for one shift block.
 *
 * Phase decides the base — an upcoming rotation is brand, a finished one
 * recedes to grey — and a past shift still carrying unmarked students turns
 * amber, because that is the one state the faculty has to act on.
 */
function shiftTone(shift: FacultyShift): string {
  if (shift.status === "cancelled") {
    return "bg-rose-50 text-rose-700 border-rose-200 line-through";
  }
  const phase = shiftPhase(shift);
  if (phase === "past") {
    const unmarked = shift.statuses.some((v) => v === "scheduled");
    return unmarked
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  }
  if (phase === "active" || phase === "grace") {
    return "bg-emerald-50 text-emerald-800 border-emerald-300";
  }
  return "bg-brand-600/10 text-brand-800 border-brand-600/25";
}

function shiftChipLabel(shift: FacultyShift): string {
  const start = new Date(shift.starts_at);
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time} ${shift.section?.name ?? SHIFT_TYPE_LABEL[shift.shift_type]}`;
}

/**
 * Month and week views over the shift list.
 *
 * The table this replaces was fine for reading one shift at a time and no use
 * at all for the thing a rotation is actually planned against — where the gaps
 * are. Month answers that at a glance; week keeps the hour grid a duty roster
 * is normally drawn on, with each shift occupying the height of its window.
 */
function ShiftCalendar({
  shifts,
  onOpen,
}: {
  shifts: FacultyShift[];
  onOpen: (id: string) => void;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const today = startOfDay(new Date());

  // Bucket by local calendar day once, so neither grid re-scans the list per
  // cell. A shift that runs past midnight belongs to the day it started.
  const byDay = useMemo(() => {
    const map = new Map<string, FacultyShift[]>();
    for (const shift of shifts) {
      const key = startOfDay(new Date(shift.starts_at)).toDateString();
      const list = map.get(key) ?? [];
      list.push(shift);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [shifts]);

  const step = (direction: number) => {
    setCursor((prev) =>
      view === "month"
        ? new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
        : addDays(prev, direction * 7),
    );
  };

  const heading =
    view === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : (() => {
          const from = startOfWeek(cursor);
          const to = addDays(from, 6);
          const sameMonth = from.getMonth() === to.getMonth();
          return `${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${to.toLocaleDateString(
            undefined,
            sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
          )}`;
        })();

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCursor(today)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-subtle"
          >
            Today
          </button>
          <button
            onClick={() => step(-1)}
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-subtle hover:text-gray-700"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => step(1)}
            aria-label={view === "month" ? "Next month" : "Next week"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-subtle hover:text-gray-700"
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
          </button>
          <h3 className="ml-1.5 font-display text-base font-semibold text-gray-900">{heading}</h3>
        </div>

        <div className="flex rounded-lg border border-gray-300 p-0.5">
          {(["month", "week"] as CalendarView[]).map((option) => (
            <button
              key={option}
              onClick={() => setView(option)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                view === option ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-subtle"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid cursor={cursor} today={today} byDay={byDay} onOpen={onOpen} />
      ) : (
        <WeekGrid cursor={cursor} today={today} byDay={byDay} onOpen={onOpen} />
      )}
    </div>
  );
}

function MonthGrid({
  cursor,
  today,
  byDay,
  onOpen,
}: {
  cursor: Date;
  today: Date;
  byDay: Map<string, FacultyShift[]>;
  onOpen: (id: string) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  // Six rows always, so the grid does not change height as months change and
  // push the page around underneath the pointer.
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-hairline bg-subtle">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, today);
          const dayShifts = byDay.get(day.toDateString()) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[104px] border-b border-r border-hairline p-1.5 [&:nth-child(7n)]:border-r-0 ${
                inMonth ? "bg-surface" : "bg-subtle/40"
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    isToday
                      ? "bg-brand-600 font-semibold text-white"
                      : inMonth
                        ? "text-gray-600"
                        : "text-gray-300"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayShifts.slice(0, 3).map((shift) => (
                  <button
                    key={shift.id}
                    onClick={() => onOpen(shift.id)}
                    title={`${shiftTitle(shift)} · ${formatShiftTimeRange(shift)}`}
                    className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80 ${shiftTone(shift)}`}
                  >
                    {shiftChipLabel(shift)}
                  </button>
                ))}
                {dayShifts.length > 3 && (
                  <p className="px-1.5 text-[10px] font-medium text-gray-400">
                    +{dayShifts.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  cursor,
  today,
  byDay,
  onOpen,
}: {
  cursor: Date;
  today: Date;
  byDay: Map<string, FacultyShift[]>;
  onOpen: (id: string) => void;
}) {
  const from = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
    (_, i) => GRID_START_HOUR + i,
  );
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_ROW_PX;

  /** Where a shift sits in the column, clamped to the drawn hours. */
  const place = (shift: FacultyShift, day: Date) => {
    const start = new Date(shift.starts_at);
    const end = new Date(shift.ends_at);
    const dayStart = startOfDay(day);
    const startHour = (start.getTime() - dayStart.getTime()) / 3_600_000;
    // A night shift ends the next morning; stop it at the bottom of the grid
    // rather than letting it run off the column.
    const endHour = Math.min((end.getTime() - dayStart.getTime()) / 3_600_000, GRID_END_HOUR);
    const top = (Math.max(startHour, GRID_START_HOUR) - GRID_START_HOUR) * HOUR_ROW_PX;
    const height = Math.max((endHour - Math.max(startHour, GRID_START_HOUR)) * HOUR_ROW_PX, 22);
    return { top, height };
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-hairline bg-subtle">
          <div />
          {days.map((day) => {
            const isToday = sameDay(day, today);
            return (
              <div key={day.toISOString()} className="px-2 py-2 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {WEEKDAYS[day.getDay()]}
                </p>
                <span
                  className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums ${
                    isToday ? "bg-brand-600 font-semibold text-white" : "text-gray-700"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[56px_repeat(7,1fr)]">
          <div className="relative" style={{ height: gridHeight }}>
            {hours.slice(0, -1).map((hour, i) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-gray-400"
                style={{ top: i * HOUR_ROW_PX }}
              >
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="relative border-l border-hairline"
              style={{ height: gridHeight }}
            >
              {hours.slice(0, -1).map((hour, i) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-hairline"
                  style={{ top: i * HOUR_ROW_PX }}
                />
              ))}
              {(byDay.get(day.toDateString()) ?? []).map((shift) => {
                const { top, height } = place(shift, day);
                return (
                  <button
                    key={shift.id}
                    onClick={() => onOpen(shift.id)}
                    title={`${shiftTitle(shift)} · ${formatShiftTimeRange(shift)}`}
                    style={{ top, height }}
                    className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] font-medium transition-opacity hover:opacity-80 ${shiftTone(shift)}`}
                  >
                    <span className="block truncate">{shift.section?.name ?? SHIFT_TYPE_LABEL[shift.shift_type]}</span>
                    <span className="block truncate text-[10px] opacity-75">
                      {formatShiftTimeRange(shift)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
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
  onDelete,
}: {
  shiftId: string;
  onBack: () => void;
  onChanged: () => void;
  /** Raised to the page, which owns the confirm dialog and the refresh. */
  onDelete: (shift: FacultyShift) => void;
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
          <button
            onClick={() => onDelete(shift)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
          >
            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
            Delete
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
