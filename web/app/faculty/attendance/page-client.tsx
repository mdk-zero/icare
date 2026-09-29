"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faChevronLeft,
  faChevronRight,
  faPlus,
  faTimes,
  faArrowLeft,
  faUserCheck,
  faTrash,
  faBan,
  faRotateLeft,
  faUsers,
  faPercent,
  faClipboardList,
  faPen,
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
  fetchFacultyTeams,
  fetchRooms,
  type FacultyShift,
  type ShiftRosterEntry,
  type Room,
} from "../../lib/api";
import {
  SHIFT_ATTENDANCE_LABEL,
  SHIFT_ATTENDANCE_TONE,
  SHIFT_PHASE_LABEL,
  SHIFT_PHASE_TONE,
  SHIFT_TYPE_LABEL,
  SHIFT_EARLY_CHECKIN_MINUTES,
  SHIFT_LATE_AFTER_MINUTES,
  formatShiftTimeRange,
  shiftPhase,
  shiftTitle,
  shiftWindowFromPreset,
  tallyAttendance,
  type ShiftAttendanceStatus,
  type ShiftType,
} from "../../lib/shifts";
import { EcgLoader } from "../../components/EcgLoader";
import {
  SkeletonShiftCalendar,
  SkeletonShiftRoster,
  SkeletonStatTile,
} from "../../components/skeletons";

const NO_SHIFTS: FacultyShift[] = [];
const NO_GROUPS: GroupOption[] = [];
const NO_ROOMS: Room[] = [];

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

const inputClass =
  "w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600";
const labelClass = "block text-xs font-medium text-gray-600 mb-1";

/** A group a shift can roster, labelled "Section · Group" since group names repeat. */
interface GroupOption {
  id: string;
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` for a date input, on the local clock. */
function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm` for a datetime-local input, on the local clock. */
function dateTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${dateInputValue(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayISO(): string {
  return dateInputValue(new Date());
}

/** Who a shift rosters: its group, or its whole section for older shifts. */
function shiftGroupLabel(shift: FacultyShift): string | null {
  if (shift.team) return [shift.section?.name, shift.team.name].filter(Boolean).join(" · ");
  return shift.section?.name ?? null;
}

export default function AttendanceClient() {
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const { data, loading, refresh } = usePageData("faculty:attendance", async () => {
    const [shifts, teams, rooms] = await Promise.all([
      fetchShifts(),
      fetchFacultyTeams(),
      fetchRooms(),
    ]);
    // The teams route already narrows an instructor to the groups they supervise.
    const sectionName = new Map((teams?.sections ?? []).map((s) => [s.id, s.name]));
    const groups: GroupOption[] = (teams?.teams ?? [])
      .map((t) => ({ id: t.id, label: [sectionName.get(t.section_id), t.name].filter(Boolean).join(" · ") }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { shifts, groups, rooms };
  });

  const shifts = data?.shifts ?? NO_SHIFTS;
  const groups = data?.groups ?? NO_GROUPS;
  const rooms = data?.rooms ?? NO_ROOMS;

  // Headline numbers read across every shift on screen, so a single shift's
  // roster cannot disagree with the tiles above it.
  const overall = useMemo(() => tallyAttendance(shifts.flatMap((s) => s.statuses)), [shifts]);
  const onNow = useMemo(
    () =>
      shifts.filter((s) => {
        const phase = shiftPhase(s);
        return phase === "active" || phase === "grace";
      }).length,
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
      <>
        <ShiftRoster
          shiftId={openShiftId}
          groups={groups}
          rooms={rooms}
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
        {confirm && (
          <ConfirmModal config={confirm} onClose={() => !confirm.loading && setConfirm(null)} />
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 h-3.5" />,
          label: "Shifts Management",
        }}
        title="Shifting Schedule"
        subtitle="Schedule clinical shifts. Attendance is taken automatically from students' sign-ins and app activity."
        action={{
          icon: <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />,
          onClick: () => setFormOpen(true),
          label: "Schedule a new shift for one of your groups",
          text: "Schedule shift",
        }}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStatTile key={i} />)
        ) : (
          <>
            <StatTile
              icon={faClipboardList}
              value={shifts.length}
              label="Shifts scheduled"
              caption={
                onNow > 0 ? `${onNow} on now` : undefined
              }
            />
            <StatTile
              icon={faPercent}
              value={overall.rate === null ? "—" : `${overall.rate}%`}
              label="Attendance rate"
              caption="Present or late, of those marked"
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatTile
              icon={faUserCheck}
              value={overall.present + overall.late}
              label="Attended"
              caption={overall.late > 0 ? `${overall.late} late` : undefined}
              iconBg="bg-brand-600/10"
              iconColor="text-brand-600"
            />
            <StatTile
              icon={faUsers}
              value={overall.absent}
              label="Absent"
              caption={overall.excused > 0 ? `${overall.excused} excused separately` : undefined}
              iconBg="bg-rose-50"
              iconColor="text-rose-600"
            />
          </>
        )}
      </div>

      {loading ? (
        <SkeletonShiftCalendar />
      ) : shifts.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon
            icon={faCalendarCheck}
            className="mx-auto mb-4 h-12 w-12 text-gray-300"
          />
          <h3 className="text-lg font-semibold text-gray-700">No shifts scheduled yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Schedule a shift for one of your groups — every member is rostered, and
            attendance is taken from their sign-ins and app activity.
          </p>
        </div>
      ) : (
        <ShiftCalendar shifts={shifts} onOpen={setOpenShiftId} />
      )}

      {formOpen && (
        <ShiftFormModal
          groups={groups}
          rooms={rooms}
          onClose={() => setFormOpen(false)}
          onSaved={async (assigned) => {
            setFormOpen(false);
            await refresh();
            toast(
              assigned > 0
                ? `Shift scheduled — ${assigned} student${assigned === 1 ? "" : "s"} rostered`
                : "Shift scheduled — no students in that group yet",
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
  return `${time} ${shiftGroupLabel(shift) ?? SHIFT_TYPE_LABEL[shift.shift_type]}`;
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
            sameMonth
              ? { day: "numeric", year: "numeric" }
              : { month: "short", day: "numeric", year: "numeric" },
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
                {hour === 0
                  ? "12 AM"
                  : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`}
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
                    <span className="block truncate">
                      {shiftGroupLabel(shift) ?? SHIFT_TYPE_LABEL[shift.shift_type]}
                    </span>
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

/** Schedules a new shift, or edits `shift` when one is given. */
function ShiftFormModal({
  groups,
  rooms,
  shift,
  onClose,
  onSaved,
}: {
  groups: GroupOption[];
  rooms: Room[];
  shift?: FacultyShift;
  onClose: () => void;
  /** Students rostered, for a new shift. */
  onSaved: (assigned: number) => void;
}) {
  const editing = !!shift;
  const [teamId, setTeamId] = useState(shift ? shift.team_id ?? "" : groups[0]?.id ?? "");
  const [shiftType, setShiftType] = useState<ShiftType>(shift?.shift_type ?? "am");
  const [date, setDate] = useState(shift ? dateInputValue(new Date(shift.starts_at)) : todayISO());
  const [customStart, setCustomStart] = useState(shift ? dateTimeInputValue(shift.starts_at) : "");
  const [customEnd, setCustomEnd] = useState(shift ? dateTimeInputValue(shift.ends_at) : "");
  const [roomId, setRoomId] = useState(shift?.room_id ?? "");
  const [label, setLabel] = useState(shift?.label ?? "");
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
      window = {
        starts_at: new Date(customStart).toISOString(),
        ends_at: new Date(customEnd).toISOString(),
      };
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
    // An older section-wide shift may stay section-wide when edited.
    if (!teamId && !editing) {
      setError("Pick a group to roster.");
      return;
    }

    const fields = {
      shift_type: shiftType,
      starts_at: window.starts_at,
      ends_at: window.ends_at,
      room_id: roomId || null,
      label: label.trim() || null,
    };

    setSaving(true);
    if (shift) {
      const result = await updateShift(shift.id, {
        details: { ...fields, ...(teamId ? { team_id: teamId } : {}) },
      });
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved(0);
      return;
    }

    const result = await createShift({ team_id: teamId, ...fields });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved(result.assigned ?? 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between border-b border-hairline bg-subtle p-4">
          <h2 className="text-lg font-bold text-gray-900">{editing ? "Edit Shift" : "Schedule Shift"}</h2>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-200">
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 p-4">
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <div>
            <label className={labelClass}>Group</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className={inputClass}
            >
              {groups.length === 0 && !editing && <option value="">No groups available</option>}
              {editing && !shift?.team_id && (
                <option value="">{shift?.section?.name ?? "Section"} (whole section)</option>
              )}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {editing
                ? "Changing the group swaps the roster for its members, until attendance is marked."
                : "Every member of the group is rostered onto the shift."}
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
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className={inputClass}
              >
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
              disabled={saving || (!editing && groups.length === 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <EcgLoader />}
              {editing ? "Save changes" : "Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShiftRoster({
  shiftId,
  groups,
  rooms,
  onBack,
  onChanged,
  onDelete,
}: {
  shiftId: string;
  groups: GroupOption[];
  rooms: Room[];
  onBack: () => void;
  onChanged: () => void;
  /** Raised to the page, which owns the confirm dialog and the refresh. */
  onDelete: (shift: FacultyShift) => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, loading, refresh } = usePageData(`faculty:shift:${shiftId}`, () =>
    fetchShiftRoster(shiftId),
  );

  const shift = data?.shift;
  const roster = useMemo<ShiftRosterEntry[]>(() => data?.roster ?? [], [data]);
  const tally = useMemo(() => tallyAttendance(roster.map((r) => r.attendance_status)), [roster]);

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
      <div>
        <BackButton onBack={onBack} />
        <SkeletonShiftRoster />
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
        badge={{
          icon: <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 h-3.5" />,
          label: "Attendance",
        }}
        title={shiftTitle(shift)}
        subtitle={`${shiftGroupLabel(shift) ?? "No group"} · ${formatShiftTimeRange(shift)}${
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
          {tally.rate === null ? "No attendance yet" : `${tally.rate}% attendance`}
          {tally.scheduled > 0 &&
            ` · ${tally.scheduled} ${phase === "upcoming" ? "scheduled" : "not checked in yet"}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
            Edit
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

      <p className="mb-3 text-xs text-gray-500">
        Students are checked in when they sign in or use the app from{" "}
        {SHIFT_EARLY_CHECKIN_MINUTES} minutes before the shift until it ends, and marked late
        after the first {SHIFT_LATE_AFTER_MINUTES} minutes. Anyone not seen by the end is marked
        absent; you can excuse an absence.
      </p>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
          <FontAwesomeIcon icon={faUsers} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700">No students rostered</h3>
          <p className="mt-1 text-sm text-gray-500">
            {shift.team_id
              ? "This group had no members when the shift was created."
              : "This section had no students when the shift was created."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
          <ul className="divide-y divide-hairline">
            {roster.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {entry.users?.name ?? "Unknown student"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {entry.users?.email ?? ""}
                    {entry.checked_in_at &&
                      ` · in at ${new Date(entry.checked_in_at).toLocaleTimeString([], TIME)}`}
                    {entry.checked_out_at &&
                      entry.checked_out_at !== entry.checked_in_at &&
                      ` · last seen ${new Date(entry.checked_out_at).toLocaleTimeString([], TIME)}`}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SHIFT_ATTENDANCE_TONE[entry.attendance_status]}`}
                >
                  {SHIFT_ATTENDANCE_LABEL[entry.attendance_status]}
                </span>

                <div className="flex items-center gap-1">
                  {savingId === entry.id ? (
                    <EcgLoader className="text-brand-600" />
                  ) : entry.attendance_status === "absent" ? (
                    <button
                      onClick={() => mark(entry, "excused")}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      Excuse
                    </button>
                  ) : entry.attendance_status === "excused" ? (
                    <button
                      onClick={() => mark(entry, "absent")}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      Undo excuse
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editOpen && (
        <ShiftFormModal
          groups={groups}
          rooms={rooms}
          shift={shift}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await refresh();
            onChanged();
            toast("Shift updated");
          }}
        />
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
