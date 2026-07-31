/**
 * Shared shift vocabulary — labels, presets, and the time-window arithmetic
 * that decides whether a nurse is on duty.
 *
 * Deliberately pure and client-safe: the server gate (`lib/shift-gate.ts`),
 * the faculty scheduler, and the student banners all have to agree on what
 * "active" means, and the only way to guarantee that is one implementation
 * with no database in it.
 */

export type ShiftType = 'am' | 'pm' | 'night' | 'custom';
export type ShiftStatus = 'scheduled' | 'cancelled';
export type ShiftAttendanceStatus =
  | 'scheduled'
  | 'present'
  | 'late'
  | 'absent'
  | 'excused';

export const SHIFT_TYPES: ShiftType[] = ['am', 'pm', 'night', 'custom'];

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  am: 'AM',
  pm: 'PM',
  night: 'Night',
  custom: 'Custom',
};

/**
 * Standard ward rotations. `night` ends the following morning — callers
 * expanding a preset into timestamps must roll the end date forward when
 * `end <= start`, which `presetEndsNextDay` reports.
 */
export const SHIFT_TYPE_PRESETS: Record<
  Exclude<ShiftType, 'custom'>,
  { start: string; end: string }
> = {
  am: { start: '06:00', end: '14:00' },
  pm: { start: '14:00', end: '22:00' },
  night: { start: '22:00', end: '06:00' },
};

export function presetEndsNextDay(type: Exclude<ShiftType, 'custom'>): boolean {
  const { start, end } = SHIFT_TYPE_PRESETS[type];
  return end <= start;
}

/**
 * Finishing a chart at 14:02 for a shift that ended at 14:00 has to work —
 * clinical documentation is written up at the end of a rotation, not during
 * it. Writes stay allowed this long past `ends_at`.
 */
export const SHIFT_END_GRACE_MINUTES = 15;

/** First write later than this into a shift marks the nurse 'late'. */
export const SHIFT_LATE_AFTER_MINUTES = 15;

/** Ceiling on how many occurrences one "repeat" may expand to. */
export const MAX_SERIES_OCCURRENCES = 90;

/**
 * Whether reading a patient chart requires being on shift. Off by design:
 * a 403 here would blank the web patients page and the mobile home screen
 * and poison their offline read caches, and off-shift chart *review* is
 * pedagogically fine. Writes are what the gate is for. Flip to `true` for
 * a strict deployment.
 */
export const GATE_PATIENT_READS = false;

export const SHIFT_ATTENDANCE_LABEL: Record<ShiftAttendanceStatus, string> = {
  scheduled: 'Scheduled',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};

export const SHIFT_ATTENDANCE_TONE: Record<ShiftAttendanceStatus, string> = {
  scheduled: 'bg-gray-100 text-gray-700 border-gray-200',
  present: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  late: 'bg-amber-100 text-amber-700 border-amber-200',
  absent: 'bg-rose-100 text-rose-700 border-rose-200',
  excused: 'bg-sky-100 text-sky-700 border-sky-200',
};

/** The minimum a phase calculation needs. */
export interface ShiftWindow {
  starts_at: string;
  ends_at: string;
  status?: ShiftStatus;
}

export type ShiftPhase = 'cancelled' | 'upcoming' | 'active' | 'grace' | 'past';

export const SHIFT_PHASE_LABEL: Record<ShiftPhase, string> = {
  cancelled: 'Cancelled',
  upcoming: 'Upcoming',
  active: 'On now',
  grace: 'Wrapping up',
  past: 'Ended',
};

export const SHIFT_PHASE_TONE: Record<ShiftPhase, string> = {
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
  upcoming: 'bg-sky-100 text-sky-700 border-sky-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  grace: 'bg-amber-100 text-amber-700 border-amber-200',
  past: 'bg-gray-100 text-gray-600 border-gray-200',
};

const MINUTE_MS = 60_000;

/**
 * Where a shift sits relative to `at`. A cancelled shift is cancelled
 * whatever the clock says, so that check comes first.
 */
export function shiftPhase(shift: ShiftWindow, at: Date = new Date()): ShiftPhase {
  if (shift.status === 'cancelled') return 'cancelled';

  const now = at.getTime();
  const starts = new Date(shift.starts_at).getTime();
  const ends = new Date(shift.ends_at).getTime();
  if (Number.isNaN(starts) || Number.isNaN(ends)) return 'past';

  if (now < starts) return 'upcoming';
  if (now <= ends) return 'active';
  if (now <= ends + SHIFT_END_GRACE_MINUTES * MINUTE_MS) return 'grace';
  return 'past';
}

/**
 * Whether `at` falls inside the shift's writable window — the scheduled
 * window plus the end grace. Cancelled shifts never contain anything.
 */
export function shiftWindowContains(shift: ShiftWindow, at: Date = new Date()): boolean {
  const phase = shiftPhase(shift, at);
  return phase === 'active' || phase === 'grace';
}

/** Minutes from a shift's start to `at`; negative before it begins. */
export function minutesIntoShift(shift: ShiftWindow, at: Date = new Date()): number {
  return (at.getTime() - new Date(shift.starts_at).getTime()) / MINUTE_MS;
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * "Jul 30, 6:00 AM – 2:00 PM", or "Jul 30, 10:00 PM – Jul 31, 6:00 AM" when
 * the shift runs past midnight (which every night rotation does).
 */
export function formatShiftWindow(shift: ShiftWindow): string {
  const start = new Date(shift.starts_at);
  const end = new Date(shift.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Unknown window';

  const startLabel = `${start.toLocaleDateString(undefined, DATE_FORMAT)}, ${start.toLocaleTimeString(undefined, TIME_FORMAT)}`;
  const endLabel = sameCalendarDay(start, end)
    ? end.toLocaleTimeString(undefined, TIME_FORMAT)
    : `${end.toLocaleDateString(undefined, DATE_FORMAT)}, ${end.toLocaleTimeString(undefined, TIME_FORMAT)}`;

  return `${startLabel} – ${endLabel}`;
}

/** Just the clock range, for cards that already show the date. */
export function formatShiftTimeRange(shift: ShiftWindow): string {
  const start = new Date(shift.starts_at);
  const end = new Date(shift.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  return `${start.toLocaleTimeString(undefined, TIME_FORMAT)} – ${end.toLocaleTimeString(undefined, TIME_FORMAT)}`;
}

/** "AM · Simulation Ward 201" — the one-line identity of a shift. */
export function shiftTitle(shift: {
  shift_type: ShiftType;
  label?: string | null;
  room?: { name: string; room_number: string } | null;
}): string {
  const parts = [shift.label?.trim() || SHIFT_TYPE_LABEL[shift.shift_type]];
  if (shift.room) parts.push(`${shift.room.name} ${shift.room.room_number}`.trim());
  return parts.join(' · ');
}
