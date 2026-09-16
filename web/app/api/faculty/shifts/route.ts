import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultySectionIds } from '@/app/lib/roster';
import { logAudit } from '@/app/lib/audit';
import { SHIFT_TYPES, type ShiftAttendanceStatus, type ShiftType } from '@/app/lib/shifts';

const SHIFT_COLUMNS =
  'id, section_id, room_id, label, shift_type, starts_at, ends_at, notes, status, created_at, section:sections(id, name), room:rooms(id, name, room_number)';

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

/**
 * Sections the caller may schedule into. Admins get every section; faculty get
 * theirs. Returning null means "no restriction" so callers can skip the filter
 * rather than building an `in` clause over every id in the system.
 */
async function scopeSectionIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
): Promise<string[] | null> {
  if (session.role === 'admin') return null;
  return await getFacultySectionIds(supabase, session.uid);
}

/** GET /api/faculty/shifts — scheduled shifts with their attendance tallies. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const sectionIds = await scopeSectionIds(supabase, session);
    if (sectionIds !== null && sectionIds.length === 0) {
      return NextResponse.json({ shifts: [] });
    }

    let query = supabase
      .from('shifts')
      .select(SHIFT_COLUMNS)
      .order('starts_at', { ascending: false })
      .limit(200);
    if (sectionIds !== null) query = query.in('section_id', sectionIds);

    const { data: shifts, error } = await query;
    if (error) {
      console.error('Failed to fetch shifts', error);
      return NextResponse.json({ error: 'Unable to load shifts' }, { status: 500 });
    }

    const ids = (shifts ?? []).map((s) => s.id);
    const byShift = new Map<string, ShiftAttendanceStatus[]>();
    if (ids.length > 0) {
      const { data: assignments } = await supabase
        .from('shift_assignments')
        .select('shift_id, attendance_status')
        .in('shift_id', ids);
      for (const row of assignments ?? []) {
        const list = byShift.get(row.shift_id) ?? [];
        list.push(row.attendance_status as ShiftAttendanceStatus);
        byShift.set(row.shift_id, list);
      }
    }

    return NextResponse.json({
      shifts: (shifts ?? []).map((shift) => ({
        ...shift,
        statuses: byShift.get(shift.id) ?? [],
      })),
    });
  } catch (err) {
    console.error('Fetch shifts failed', err);
    return NextResponse.json({ error: 'Unable to load shifts' }, { status: 500 });
  }
}

/**
 * POST /api/faculty/shifts — schedules one shift and rosters its section onto it.
 *
 * A clinical rotation is a section-wide event, so every student in the section
 * is assigned at creation rather than picked one by one; individuals can be
 * excused afterwards from the attendance screen.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sectionId = typeof body.section_id === 'string' ? body.section_id.trim() : '';
  const shiftType = typeof body.shift_type === 'string' ? body.shift_type : 'custom';
  const startsAt = typeof body.starts_at === 'string' ? body.starts_at : '';
  const endsAt = typeof body.ends_at === 'string' ? body.ends_at : '';
  const roomId = typeof body.room_id === 'string' && body.room_id.trim() ? body.room_id.trim() : null;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  if (!sectionId) return NextResponse.json({ error: 'A section is required' }, { status: 400 });
  if (!SHIFT_TYPES.includes(shiftType as ShiftType)) {
    return NextResponse.json({ error: 'Invalid shift type' }, { status: 400 });
  }
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'A valid start and end time are required' }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: 'The shift must end after it starts' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const sectionIds = await scopeSectionIds(supabase, session);
    if (sectionIds !== null && !sectionIds.includes(sectionId)) {
      return NextResponse.json({ error: 'That section is not one of yours' }, { status: 403 });
    }

    const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();

    const { data: shift, error } = await supabase
      .from('shifts')
      .insert({
        campus_id: campus?.id ?? null,
        section_id: sectionId,
        room_id: roomId,
        created_by: session.uid,
        label,
        shift_type: shiftType,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes,
      })
      .select(SHIFT_COLUMNS)
      .single();

    if (error || !shift) {
      console.error('Failed to create shift', error);
      return NextResponse.json({ error: 'Unable to create shift' }, { status: 500 });
    }

    const { data: students } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'student')
      .eq('section_id', sectionId);

    let assigned = 0;
    if (students && students.length > 0) {
      const { error: assignError } = await supabase.from('shift_assignments').insert(
        students.map((s) => ({
          shift_id: shift.id,
          student_id: s.id,
          assigned_by: session.uid,
        })),
      );
      if (assignError) console.error('Failed to roster students onto shift', assignError);
      else assigned = students.length;
    }

    await logAudit(
      session,
      {
        action: 'shift.create',
        entityType: 'shifts',
        entityId: shift.id,
        details: { section_id: sectionId, shift_type: shiftType, assigned },
      },
      request,
    );

    return NextResponse.json({ shift: { ...shift, statuses: Array(assigned).fill('scheduled') }, assigned }, { status: 201 });
  } catch (err) {
    console.error('Create shift failed', err);
    return NextResponse.json({ error: 'Unable to create shift' }, { status: 500 });
  }
}
