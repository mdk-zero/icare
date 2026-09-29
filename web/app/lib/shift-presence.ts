import { getSupabaseAdmin } from './supabase/server';
import { SHIFT_END_GRACE_MINUTES } from './shifts';

/**
 * Attendance read off app activity: a student who uses the app (web or
 * mobile) while one of their shifts is running is marked present on it.
 *
 * readSession() calls this for every signed-in student request, after the
 * response has gone out. The first request inside the shift window turns a
 * 'scheduled' row 'present' and stamps checked_in_at; later ones move
 * checked_out_at along, so the row spans the student's first and last
 * activity in the shift. A row faculty already set to absent or excused is
 * left alone: their call outranks the clock.
 */

/** Per-instance throttle, so a burst of requests costs one lookup. */
const THROTTLE_MS = 2 * 60_000;
const lastRecorded = new Map<string, number>();

export async function recordShiftActivity(studentId: string, at: Date = new Date()): Promise<void> {
  const now = at.getTime();
  const previous = lastRecorded.get(studentId);
  if (previous !== undefined && now - previous < THROTTLE_MS) return;
  lastRecorded.set(studentId, now);

  const supabase = getSupabaseAdmin();
  const iso = at.toISOString();
  // A shift still counts through its end grace, when charts get written up.
  const endedAfter = new Date(now - SHIFT_END_GRACE_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from('shift_assignments')
    .select('id, attendance_status, shifts!inner(status, starts_at, ends_at)')
    .eq('student_id', studentId)
    .in('attendance_status', ['scheduled', 'present', 'late'])
    .eq('shifts.status', 'scheduled')
    .lte('shifts.starts_at', iso)
    .gte('shifts.ends_at', endedAfter);
  if (error) {
    console.error('Failed to read the student shifts for presence', error);
    return;
  }

  for (const row of data ?? []) {
    const patch =
      row.attendance_status === 'scheduled'
        ? { attendance_status: 'present', checked_in_at: iso, checked_out_at: iso }
        : { checked_out_at: iso };
    const { error: updateError } = await supabase
      .from('shift_assignments')
      .update(patch)
      .eq('id', row.id)
      // Only if nobody changed it in the meantime (a faculty mark wins).
      .eq('attendance_status', row.attendance_status);
    if (updateError) console.error('Failed to record shift presence', row.id, updateError);
  }
}
