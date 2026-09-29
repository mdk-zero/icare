import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { SHIFT_TYPES, type ShiftAttendanceStatus, type ShiftType } from '@/app/lib/shifts';
import {
  LEGACY_SHIFT_COLUMNS,
  SHIFT_COLUMNS,
  getShiftScope,
  isMissingTeamColumn,
  loadSchedulableTeam,
  shiftInScope,
  teamStudentIds,
} from '@/app/lib/shift-scope';

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
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
    const scope = await getShiftScope(supabase, session);
    if (scope.sectionIds !== null && scope.sectionIds.length === 0) {
      return NextResponse.json({ shifts: [] });
    }

    const list = (columns: string) => {
      let query = supabase
        .from('shifts')
        .select(columns)
        .order('starts_at', { ascending: false })
        .limit(500);
      if (scope.sectionIds !== null) query = query.in('section_id', scope.sectionIds);
      return query;
    };
    let result = await list(SHIFT_COLUMNS);
    if (result.error && isMissingTeamColumn(result.error)) result = await list(LEGACY_SHIFT_COLUMNS);
    if (result.error) {
      console.error('Failed to fetch shifts', result.error);
      return NextResponse.json({ error: 'Unable to load shifts' }, { status: 500 });
    }
    // An instructor sees their own groups' shifts, not a colleague's group in the same section.
    const shifts = ((result.data ?? []) as unknown as { id: string; section_id: string | null; team_id?: string | null }[])
      .filter((s) => shiftInScope(scope, s))
      .slice(0, 200);

    const ids = shifts.map((s) => s.id);
    const byShift = new Map<string, ShiftAttendanceStatus[]>();
    if (ids.length > 0) {
      let tallyQuery = supabase
        .from('shift_assignments')
        .select('shift_id, attendance_status')
        .in('shift_id', ids);
      // Faculty tally only the members of the groups they supervise.
      const mine = await getScopedStudentIds(supabase, session);
      if (mine) {
        tallyQuery = tallyQuery.in('student_id', mine.length > 0 ? mine : ['00000000-0000-0000-0000-000000000000']);
      }
      const { data: assignments } = await tallyQuery;
      for (const row of assignments ?? []) {
        const list = byShift.get(row.shift_id) ?? [];
        list.push(row.attendance_status as ShiftAttendanceStatus);
        byShift.set(row.shift_id, list);
      }
    }

    return NextResponse.json({
      shifts: shifts.map((shift) => ({
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
 * POST /api/faculty/shifts — schedules one shift and rosters a group onto it.
 *
 * Every member of the group is assigned at creation rather than picked one by
 * one; individuals can be excused afterwards from the attendance screen.
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

  const teamId = typeof body.team_id === 'string' ? body.team_id.trim() : '';
  const shiftType = typeof body.shift_type === 'string' ? body.shift_type : 'custom';
  const startsAt = typeof body.starts_at === 'string' ? body.starts_at : '';
  const endsAt = typeof body.ends_at === 'string' ? body.ends_at : '';
  const roomId = typeof body.room_id === 'string' && body.room_id.trim() ? body.room_id.trim() : null;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  if (!teamId) return NextResponse.json({ error: 'A group is required' }, { status: 400 });
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

    const scope = await getShiftScope(supabase, session);
    const team = await loadSchedulableTeam(supabase, scope, teamId);
    if (!team) {
      return NextResponse.json({ error: 'That group is not one of yours' }, { status: 403 });
    }

    const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();

    const row = {
      campus_id: campus?.id ?? null,
      section_id: team.section_id,
      team_id: team.id,
      room_id: roomId,
      created_by: session.uid,
      label,
      shift_type: shiftType,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      notes,
    };
    let inserted = await supabase.from('shifts').insert(row).select(SHIFT_COLUMNS).single();
    if (inserted.error && isMissingTeamColumn(inserted.error)) {
      // Before 064 the shift can't name its group; it still rosters only the group.
      const { team_id: _omit, ...legacy } = row;
      void _omit;
      inserted = await supabase.from('shifts').insert(legacy).select(LEGACY_SHIFT_COLUMNS).single();
    }
    const shift = inserted.data as unknown as { id: string } | null;
    if (inserted.error || !shift) {
      console.error('Failed to create shift', inserted.error);
      return NextResponse.json({ error: 'Unable to create shift' }, { status: 500 });
    }

    const students = await teamStudentIds(supabase, team.id);
    let assigned = 0;
    if (students.length > 0) {
      const { error: assignError } = await supabase.from('shift_assignments').insert(
        students.map((studentId) => ({
          shift_id: shift.id,
          student_id: studentId,
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
        details: { team_id: team.id, section_id: team.section_id, shift_type: shiftType, assigned },
      },
      request,
    );

    return NextResponse.json({ shift: { ...shift, statuses: Array(assigned).fill('scheduled') }, assigned }, { status: 201 });
  } catch (err) {
    console.error('Create shift failed', err);
    return NextResponse.json({ error: 'Unable to create shift' }, { status: 500 });
  }
}
