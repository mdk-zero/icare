import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { tallyAttendance, type ShiftAttendanceStatus } from '@/app/lib/shifts';

/**
 * The signed-in student's own clinical attendance record.
 *
 * Students see only their own rows — the id comes from the session, never the
 * query string, so there is no way to ask for someone else's record.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(
        'id, attendance_status, checked_in_at, notes, shifts(id, label, shift_type, starts_at, ends_at, status, room:rooms(name, room_number))',
      )
      .eq('student_id', session.uid)
      .limit(200);

    if (error) {
      console.error('Failed to fetch student attendance', error);
      return NextResponse.json({ error: 'Unable to load attendance' }, { status: 500 });
    }

    // Sorted here rather than in the query: the ordering key lives on the
    // embedded shift, which PostgREST cannot order by across the join.
    const rows = (data ?? []) as unknown as {
      attendance_status: ShiftAttendanceStatus;
      shifts: { starts_at: string } | null;
    }[];
    rows.sort((a, b) => (b.shifts?.starts_at ?? '').localeCompare(a.shifts?.starts_at ?? ''));

    return NextResponse.json({
      shifts: rows,
      tally: tallyAttendance(rows.map((r) => r.attendance_status)),
    });
  } catch (err) {
    console.error('Fetch student attendance failed', err);
    return NextResponse.json({ error: 'Unable to load attendance' }, { status: 500 });
  }
}
