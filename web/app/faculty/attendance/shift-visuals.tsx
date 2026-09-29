"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { FacultyShift, ShiftRosterEntry } from "../../lib/api";
import {
  SHIFT_ATTENDANCE_LABEL,
  SHIFT_EARLY_CHECKIN_MINUTES,
  SHIFT_END_GRACE_MINUTES,
  SHIFT_LATE_AFTER_MINUTES,
  formatShiftTimeRange,
  shiftPhase,
  type ShiftAttendanceStatus,
} from "../../lib/shifts";

/**
 * The pieces that draw attendance rather than list it: the live duty board,
 * the check-in dots, the roster's segmented summary and its timeline. All of
 * them read time from `useNow`, so a page left open keeps moving.
 */

const MINUTE_MS = 60_000;
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** Re-renders every `intervalMs` with the current time. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** A section-wide shift has no group, so it gets a neutral slate. */
export const SECTION_WIDE_COLOR = "#94a3b8";

/**
 * One colour per group, from the shared group palette (globals.css), so a
 * group reads the same here as on the Groups page and analytics charts.
 */
export function groupColorMap(groupIds: string[]): (teamId: string | null | undefined) => string {
  const map = new Map(groupIds.map((id, i) => [id, `var(--color-group-${(i % 6) + 1})`]));
  return (teamId) => (teamId && map.get(teamId)) || SECTION_WIDE_COLOR;
}

/** Tint + rail for anything painted in a group's colour. */
export function groupTint(color: string, strength = 12): CSSProperties {
  return {
    borderLeftColor: color,
    background: `color-mix(in srgb, ${color} ${strength}%, transparent)`,
  };
}

// Status colours used for fills (bars, dots). Pills keep SHIFT_ATTENDANCE_TONE.
export const STATUS_FILL: Record<ShiftAttendanceStatus, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-500",
  absent: "bg-rose-500",
  excused: "bg-sky-400",
  scheduled: "bg-gray-300",
};

/** Order dots and segments read in: arrived first, then waiting, then missed. */
const STATUS_ORDER: ShiftAttendanceStatus[] = ["present", "late", "scheduled", "absent", "excused"];

export function PulseDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

/** One dot per rostered student: filled once the system has seen them. */
export function CheckInDots({ statuses, size = 10 }: { statuses: ShiftAttendanceStatus[]; size?: number }) {
  const sorted = [...statuses].sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
  return (
    <span className="flex flex-wrap gap-1" role="img" aria-label={summarize(statuses)}>
      {sorted.map((status, i) => (
        <span
          key={i}
          title={SHIFT_ATTENDANCE_LABEL[status]}
          style={{ width: size, height: size }}
          className={`rounded-full ${
            status === "scheduled"
              ? "border-[1.5px] border-dashed border-gray-300 bg-transparent"
              : STATUS_FILL[status]
          }`}
        />
      ))}
    </span>
  );
}

function summarize(statuses: ShiftAttendanceStatus[]): string {
  const counts = new Map<ShiftAttendanceStatus, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return STATUS_ORDER.filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${SHIFT_ATTENDANCE_LABEL[s].toLowerCase()}`)
    .join(", ");
}

/** Present/late/waiting/absent/excused as one proportional bar with a legend. */
export function SegmentBar({ statuses }: { statuses: ShiftAttendanceStatus[] }) {
  const total = statuses.length;
  const counts = STATUS_ORDER.map((status) => ({
    status,
    n: statuses.filter((s) => s === status).length,
  })).filter((c) => c.n > 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle">
        {counts.map(({ status, n }) => (
          <span
            key={status}
            className={`${STATUS_FILL[status]} transition-[width] duration-500 first:rounded-l-full last:rounded-r-full ${
              status === "scheduled" ? "opacity-60" : ""
            }`}
            style={{ width: `${(n / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {counts.map(({ status, n }) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_FILL[status]}`} />
            <span className="font-semibold tabular-nums text-gray-900">{n}</span>
            {status === "scheduled" ? "not in yet" : SHIFT_ATTENDANCE_LABEL[status].toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * How far into a shift `now` is, as a bar with the late line ticked on it —
 * the one glance that says whether a missing student is merely early days or
 * already late.
 */
export function ShiftProgress({ shift, now, color }: { shift: FacultyShift; now: number; color: string }) {
  const start = Date.parse(shift.starts_at);
  const end = Date.parse(shift.ends_at);
  const span = Math.max(end - start, 1);
  const pct = Math.min(Math.max((now - start) / span, 0), 1) * 100;
  const lateAt = ((SHIFT_LATE_AFTER_MINUTES * MINUTE_MS) / span) * 100;
  const left = Math.max(end - now, 0);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.round((left % 3_600_000) / MINUTE_MS);

  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-subtle">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
        <span
          className="absolute -top-1 h-3.5 w-px bg-amber-500"
          style={{ left: `${lateAt}%` }}
          title={`Late after ${SHIFT_LATE_AFTER_MINUTES} min`}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-gray-500">
        <span>{new Date(start).toLocaleTimeString([], TIME)}</span>
        <span>
          {now > end ? "Wrapping up" : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`}
        </span>
        <span>{new Date(end).toLocaleTimeString([], TIME)}</span>
      </div>
    </div>
  );
}

/**
 * Live cards for every shift running right now, or the next one due when the
 * ward is quiet.
 */
export function DutyBoard({
  shifts,
  now,
  colorFor,
  labelFor,
  onOpen,
}: {
  shifts: FacultyShift[];
  now: number;
  colorFor: (teamId: string | null | undefined) => string;
  labelFor: (shift: FacultyShift) => string;
  onOpen: (id: string) => void;
}) {
  const at = new Date(now);
  const live = shifts.filter((s) => {
    const phase = shiftPhase(s, at);
    return phase === "active" || phase === "grace";
  });
  const next = live.length
    ? null
    : shifts
        .filter((s) => shiftPhase(s, at) === "upcoming")
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;

  if (live.length === 0 && !next) return null;

  if (live.length === 0 && next) {
    const color = colorFor(next.team_id);
    const startsIn = Date.parse(next.starts_at) - now;
    const days = Math.floor(startsIn / 86_400_000);
    const hours = Math.floor((startsIn % 86_400_000) / 3_600_000);
    const minutes = Math.round((startsIn % 3_600_000) / MINUTE_MS);
    const when = days > 0 ? `in ${days}d ${hours}h` : hours > 0 ? `in ${hours}h ${minutes}m` : `in ${minutes}m`;
    return (
      <button
        onClick={() => onOpen(next.id)}
        className="mb-5 flex w-full items-center gap-3 rounded-xl border border-l-4 border-hairline bg-surface px-4 py-3 text-left shadow-tile transition-shadow hover:shadow-tile-hover"
        style={{ borderLeftColor: color }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Next shift</span>
        <span className="font-display font-semibold text-gray-900">{labelFor(next)}</span>
        <span className="hidden text-sm text-gray-500 sm:inline">
          {new Date(next.starts_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          {" · "}
          {formatShiftTimeRange(next)}
        </span>
        <span className="ml-auto rounded-full bg-subtle px-2.5 py-1 text-xs font-medium tabular-nums text-gray-700">
          {when}
        </span>
      </button>
    );
  }

  return (
    <section className="mb-5" aria-label="On duty now">
      <div className="mb-2 flex items-center gap-2">
        <PulseDot />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">On duty now</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {live.map((shift, i) => {
          const color = colorFor(shift.team_id);
          const inCount = shift.statuses.filter((s) => s === "present" || s === "late").length;
          const lateCount = shift.statuses.filter((s) => s === "late").length;
          return (
            <button
              key={shift.id}
              onClick={() => onOpen(shift.id)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative animate-rise overflow-hidden rounded-xl border border-hairline bg-surface p-4 text-left shadow-tile transition-shadow hover:shadow-tile-hover"
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold text-gray-900">{labelFor(shift)}</p>
                  <p className="truncate text-xs text-gray-500">
                    {shift.label ?? "Shift"}
                    {shift.room && ` · ${shift.room.name}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl font-bold leading-none tabular-nums text-gray-900">
                    {inCount}
                    <span className="text-base font-semibold text-gray-400">/{shift.statuses.length}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    checked in{lateCount > 0 && ` · ${lateCount} late`}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <CheckInDots statuses={shift.statuses} />
              </div>
              <div className="mt-3">
                <ShiftProgress shift={shift} now={now} color={color} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Every student on one clock: the shift's window drawn left to right, with the
 * early check-in margin before it and the grace after, and each student's
 * detected presence as a bar from first to last activity.
 */
export function AttendanceTimeline({
  shift,
  roster,
  now,
  renderAction,
}: {
  shift: FacultyShift;
  roster: ShiftRosterEntry[];
  now: number;
  renderAction: (entry: ShiftRosterEntry) => React.ReactNode;
}) {
  const start = Date.parse(shift.starts_at);
  const end = Date.parse(shift.ends_at);
  const from = start - SHIFT_EARLY_CHECKIN_MINUTES * MINUTE_MS;
  const to = end + SHIFT_END_GRACE_MINUTES * MINUTE_MS;
  const span = to - from;
  const x = (t: number) => `${(Math.min(Math.max(t, from), to) - from) / span * 100}%`;

  const hours: number[] = [];
  const firstHour = new Date(from);
  firstHour.setMinutes(0, 0, 0);
  for (let t = firstHour.getTime() + 3_600_000; t < to; t += 3_600_000) hours.push(t);
  // Label every hour on a short shift, every other one on a long one.
  const labelEvery = hours.length > 10 ? 2 : 1;

  const lateLine = start + SHIFT_LATE_AFTER_MINUTES * MINUTE_MS;
  const showNow = now >= from && now <= to && shift.status !== "cancelled";

  /** The shared backdrop of every track: margins shaded, key lines drawn. */
  const backdrop = (
    <>
      <span className="absolute inset-y-0 left-0 bg-subtle" style={{ width: x(start) }} />
      <span className="absolute inset-y-0 right-0 bg-subtle" style={{ left: x(end) }} />
      {hours.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-hairline" style={{ left: x(t) }} />
      ))}
      <span className="absolute inset-y-0 w-px bg-amber-400/70" style={{ left: x(lateLine) }} />
      {showNow && <span className="absolute inset-y-0 z-10 w-0.5 bg-rose-500" style={{ left: x(now) }} />}
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      {/* Axis */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-hairline bg-subtle/60 px-4 py-2 sm:grid-cols-[13rem_minmax(0,1fr)_6.5rem]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Student</span>
        <div className="relative hidden h-8 sm:block">
          {hours.map((t, i) =>
            i % labelEvery === 0 ? (
              <span
                key={t}
                className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-gray-400"
                style={{ left: x(t) }}
              >
                {new Date(t).toLocaleTimeString([], { hour: "numeric" })}
              </span>
            ) : null,
          )}
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800"
            style={{ left: x(lateLine) }}
          >
            late
          </span>
          {showNow && (
            <span
              className="absolute top-0 z-10 -translate-x-1/2 rounded bg-rose-500 px-1 text-[10px] font-semibold text-white"
              style={{ left: x(now) }}
            >
              now
            </span>
          )}
        </div>
        <span />
      </div>

      <ul className="divide-y divide-hairline">
        {roster.map((entry, i) => {
          const inAt = entry.checked_in_at ? Date.parse(entry.checked_in_at) : null;
          const lastAt = entry.checked_out_at ? Date.parse(entry.checked_out_at) : inAt;
          const status = entry.attendance_status;
          return (
            <li
              key={entry.id}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              className="grid animate-rise grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)_6.5rem]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_FILL[status]}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {entry.users?.name ?? "Unknown student"}
                  </p>
                  <p className="truncate text-[11px] text-gray-500">
                    {inAt
                      ? `${SHIFT_ATTENDANCE_LABEL[status]} · in ${new Date(inAt).toLocaleTimeString([], TIME)}${
                          lastAt && lastAt !== inAt ? ` · last ${new Date(lastAt).toLocaleTimeString([], TIME)}` : ""
                        }`
                      : status === "scheduled"
                        ? now < start - SHIFT_EARLY_CHECKIN_MINUTES * MINUTE_MS
                          ? "Scheduled"
                          : "Not seen yet"
                        : SHIFT_ATTENDANCE_LABEL[status]}
                  </p>
                </div>
              </div>

              <div className="relative hidden h-6 overflow-hidden rounded-md sm:block">
                {backdrop}
                {inAt !== null && lastAt !== null ? (
                  <span
                    className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ${STATUS_FILL[status]} shadow-sm`}
                    style={{
                      left: x(inAt),
                      width: `max(0.75rem, calc(${x(lastAt)} - ${x(inAt)}))`,
                    }}
                    title={`In ${new Date(inAt).toLocaleTimeString([], TIME)}`}
                  />
                ) : status === "absent" ? (
                  <span
                    className="absolute top-1/2 h-0 -translate-y-1/2 border-t-2 border-dashed border-rose-300"
                    style={{ left: x(start), right: `calc(100% - ${x(end)})` }}
                  />
                ) : status === "excused" ? (
                  <span
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-[repeating-linear-gradient(135deg,#bae6fd_0_4px,transparent_4px_8px)] ring-1 ring-sky-200"
                    style={{ left: x(start), right: `calc(100% - ${x(end)})` }}
                  />
                ) : null}
              </div>

              <div className="flex justify-end">{renderAction(entry)}</div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline bg-subtle/60 px-4 py-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-subtle ring-1 ring-hairline" /> check-in opens{" "}
          {SHIFT_EARLY_CHECKIN_MINUTES} min early · {SHIFT_END_GRACE_MINUTES} min wrap-up after
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-amber-400" /> late after {SHIFT_LATE_AFTER_MINUTES} min
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-emerald-500" /> first to last activity in the app
        </span>
      </div>
    </div>
  );
}
