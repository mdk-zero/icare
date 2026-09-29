import { getSupabaseAdmin } from './supabase/server';
import {
  SHIFT_EARLY_CHECKIN_MINUTES,
  SHIFT_END_GRACE_MINUTES,
  SHIFT_LATE_AFTER_MINUTES,
} from './shifts';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Attendance is detected by the system, not marked by hand.
 *
 *   - A student who signs in or uses the app (web or mobile) from
 *     SHIFT_EARLY_CHECKIN_MINUTES before a shift until it ends is checked in:
 *     'present', or 'late' if their first activity came more than
 *     SHIFT_LATE_AFTER_MINUTES after the start.
 *   - Later activity, through the end grace, moves checked_out_at along, so
 *     the row spans their first and last activity in the shift.
 *   - Anyone still unseen once the shift and its grace are over is 'absent'
 *     (closeEndedShifts, run whenever attendance is read).
 *
 * The one thing left to an instructor is excusing an absence.
 */

const MINUTE_MS = 60_000;

/** Per-instance throttle, so a burst of requests costs one lookup. */
const THROTTLE_MS = 2 * MINUTE_MS;
const lastRecorded = new Map<string, number>();

interface OpenAssignment {
  id: string;
  attendance_status: 'scheduled' | 'present' | 'late';
  shifts: { starts_at: string; ends_at: string };
}

/** Records that the student was active in the app at `at`. */
export async function recordShiftActivity(
  studentId: string,
  at: Date = new Date(),
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const now = at.getTime();
  const previous = lastRecorded.get(studentId);
  if (!force && previous !== undefined && now - previous < THROTTLE_MS) return;
  lastRecorded.set(studentId, now);

  const supabase = getSupabaseAdmin();
  const iso = at.toISOString();
  const startsBefore = new Date(now + SHIFT_EARLY_CHECKIN_MINUTES * MINUTE_MS).toISOString();
  const endedAfter = new Date(now - SHIFT_END_GRACE_MINUTES * MINUTE_MS).toISOString();

  const { data, error } = await supabase
    .from('shift_assignments')
    .select('id, attendance_status, shifts!inner(status, starts_at, ends_at)')
    .eq('student_id', studentId)
    .in('attendance_status', ['scheduled', 'present', 'late'])
    .eq('shifts.status', 'scheduled')
    .lte('shifts.starts_at', startsBefore)
    .gte('shifts.ends_at', endedAfter);
  if (error) {
    console.error('Failed to read the student shifts for presence', error);
    return;
  }

  for (const row of (data ?? []) as unknown as OpenAssignment[]) {
    const starts = new Date(row.shifts.starts_at).getTime();
    const ends = new Date(row.shifts.ends_at).getTime();

    let patch: Record<string, unknown>;
    if (row.attendance_status === 'scheduled') {
      // Showing up only in the wrap-up after the end is not attending it.
      if (now > ends) continue;
      const late = now > starts + SHIFT_LATE_AFTER_MINUTES * MINUTE_MS;
      patch = { attendance_status: late ? 'late' : 'present', checked_in_at: iso, checked_out_at: iso };
    } else {
      if (now < starts) continue; // already in; nothing to move before it starts
      patch = { checked_out_at: iso };
    }

    const { error: updateError } = await supabase
      .from('shift_assignments')
      .update(patch)
      .eq('id', row.id)
      // Only if nothing changed it in the meantime.
      .eq('attendance_status', row.attendance_status);
    if (updateError) console.error('Failed to record shift presence', row.id, updateError);
  }
}

/**
 * Marks absent everyone the system never saw on a shift that is over.
 * Idempotent and cheap once caught up, so every attendance reader calls it
 * rather than depending on a scheduled job.
 */
export async function closeEndedShifts(supabase: Supabase, at: Date = new Date()): Promise<number> {
  const endedBefore = new Date(at.getTime() - SHIFT_END_GRACE_MINUTES * MINUTE_MS).toISOString();

  const { data: open, error } = await supabase
    .from('shift_assignments')
    .select('id, shifts!inner(status, ends_at)')
    .eq('attendance_status', 'scheduled')
    .eq('shifts.status', 'scheduled')
    .lt('shifts.ends_at', endedBefore)
    .limit(1000);
  if (error) {
    console.error('Failed to find unattended shift rows', error);
    return 0;
  }
  const ids = (open ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;

  const { data: closed, error: closeError } = await supabase
    .from('shift_assignments')
    .update({ attendance_status: 'absent' })
    .in('id', ids)
    .eq('attendance_status', 'scheduled')
    .select('id');
  if (closeError) {
    console.error('Failed to mark unattended shift rows absent', closeError);
    return 0;
  }
  return closed?.length ?? 0;
}
