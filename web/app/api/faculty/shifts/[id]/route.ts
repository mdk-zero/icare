import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { closeEndedShifts } from '@/app/lib/shift-presence';
import { SHIFT_TYPES, type ShiftAttendanceStatus, type ShiftType } from '@/app/lib/shifts';
import {
  LEGACY_SHIFT_COLUMNS,
  SHIFT_COLUMNS,
  getShiftScope,
  isMissingTeamColumn,
  loadSchedulableTeam,
  shiftInScope,
  teamStudentIds,
  type ShiftScope,
} from '@/app/lib/shift-scope';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Attendance itself is detected (lib/shift-presence). An instructor may only
 * excuse a detected absence, or take the excuse back: each mark moves a row
 * from the status on the left to the one on the right, and nothing else.
 */
const INSTRUCTOR_MARKS: Partial<Record<ShiftAttendanceStatus, ShiftAttendanceStatus>> = {
  excused: 'absent',
  absent: 'excused',
};

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

interface ScopedShift {
  id: string;
  section_id: string | null;
  team_id?: string | null;
  starts_at: string;
  ends_at: string;
}

/** Loads the shift and refuses one outside the caller's groups and sections. */
async function loadScopedShift(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  id: string,
) {
  const load = (columns: string) => supabase.from('shifts').select(columns).eq('id', id).maybeSingle();
  let result = await load(SHIFT_COLUMNS);
  if (result.error && isMissingTeamColumn(result.error)) result = await load(LEGACY_SHIFT_COLUMNS);
  const shift = result.data as unknown as ScopedShift | null;

  if (!shift) return { error: 'Shift not found', status: 404 as const };
  const scope = await getShiftScope(supabase, session);
  if (!shiftInScope(scope, shift)) {
    return { error: 'That shift is not one of yours', status: 403 as const };
  }
  return { shift, scope };
}

/** GET — the shift plus its roster, for the attendance screen. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const supabase = getSupabaseAdmin();
    await closeEndedShifts(supabase);
    const scoped = await loadScopedShift(supabase, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    }

    const { data: roster, error } = await supabase
      .from('shift_assignments')
      // Explicit FK hint: shift_assignments points at users twice (student_id
      // and assigned_by), so a bare users(...) embed is ambiguous and errors.
      .select(
        'id, student_id, attendance_status, checked_in_at, checked_out_at, notes, users!shift_assignments_student_id_fkey(name, email)',
      )
      .eq('shift_id', id);

    if (error) {
      console.error('Failed to load shift roster', error);
      return NextResponse.json({ error: 'Unable to load the roster' }, { status: 500 });
    }

    // Faculty see only the members of the groups they supervise.
    const visibleIds = await getScopedStudentIds(supabase, session);
    const mine = visibleIds ? new Set(visibleIds) : null;

    // Alphabetical: a ward roster is read by name, and the DB order is arbitrary.
    const sorted = (roster ?? []).filter((r) => !mine || mine.has(r.student_id as string)).sort((a, b) => {
      const an = (a as unknown as { users?: { name?: string } }).users?.name ?? '';
      const bn = (b as unknown as { users?: { name?: string } }).users?.name ?? '';
      return an.localeCompare(bn);
    });

    return NextResponse.json({ shift: scoped.shift, roster: sorted });
  } catch (err) {
    console.error('Fetch shift failed', err);
    return NextResponse.json({ error: 'Unable to load the shift' }, { status: 500 });
  }
}

/**
 * PATCH — marks attendance, cancels or reinstates the shift, and/or edits it.
 *
 *   { marks: [{ assignment_id, status, notes? }] }   excuse an absence
 *                                                    ('excused') or undo it ('absent')
 *   { status: 'cancelled' | 'scheduled' }            the shift itself
 *   { details: { team_id?, shift_type?, starts_at?, ends_at?,
 *                room_id?, label?, notes? } }          its schedule
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  let body: { marks?: unknown; status?: unknown; details?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const scoped = await loadScopedShift(supabase, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    }

    if (body.details && typeof body.details === 'object') {
      const edited = await editShift(supabase, session, scoped.shift, scoped.scope, body.details as Record<string, unknown>);
      if ('error' in edited) return NextResponse.json({ error: edited.error }, { status: edited.status });
      await logAudit(
        session,
        { action: 'shift.update', entityType: 'shifts', entityId: id, details: edited.changes },
        request,
      );
    }

    if (body.status === 'cancelled' || body.status === 'scheduled') {
      const { error } = await supabase.from('shifts').update({ status: body.status }).eq('id', id);
      if (error) {
        console.error('Failed to update shift status', error);
        return NextResponse.json({ error: 'Unable to update the shift' }, { status: 500 });
      }
      await logAudit(
        session,
        { action: `shift.${body.status === 'cancelled' ? 'cancel' : 'reinstate'}`, entityType: 'shifts', entityId: id },
        request,
      );
    }

    const marks = Array.isArray(body.marks) ? body.marks : [];
    const mine = marks.length > 0 ? await getScopedStudentIds(supabase, session) : null;
    let updated = 0;
    for (const raw of marks) {
      if (!raw || typeof raw !== 'object') continue;
      const mark = raw as Record<string, unknown>;
      const assignmentId = typeof mark.assignment_id === 'string' ? mark.assignment_id : '';
      const status = mark.status as ShiftAttendanceStatus;
      const from = INSTRUCTOR_MARKS[status];
      if (!assignmentId || !from) continue;

      const patch: Record<string, unknown> = { attendance_status: status };
      if (typeof mark.notes === 'string') patch.notes = mark.notes.trim() || null;

      // `select` so the count reflects rows actually changed. An update that
      // matches nothing is not an error in PostgREST, so without this an
      // unknown or foreign assignment id would be reported back as marked.
      let update = supabase
        .from('shift_assignments')
        .update(patch)
        .eq('id', assignmentId)
        .eq('shift_id', id) // scoping guard: an id from another shift matches nothing
        .eq('attendance_status', from); // only a detected absence can be excused
      // Faculty mark only their own group members.
      if (mine) update = update.in('student_id', mine.length > 0 ? mine : ['00000000-0000-0000-0000-000000000000']);
      const { data: changed, error } = await update.select('id');
      if (error) {
        console.error('Failed to mark attendance', assignmentId, error);
        continue;
      }
      updated += changed?.length ?? 0;
    }

    if (updated > 0) {
      await logAudit(
        session,
        {
          action: 'shift.attendance.mark',
          entityType: 'shifts',
          entityId: id,
          details: { marked: updated },
        },
        request,
      );
    }

    return NextResponse.json({ updated });
  } catch (err) {
    console.error('Update shift failed', err);
    return NextResponse.json({ error: 'Unable to update the shift' }, { status: 500 });
  }
}

/**
 * Applies a schedule edit. Moving the shift to another group swaps its roster
 * for the new group's members, which is refused once anyone has been marked:
 * that attendance belongs to the old group and would be lost.
 */
async function editShift(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  shift: ScopedShift,
  scope: ShiftScope,
  details: Record<string, unknown>,
): Promise<{ changes: Record<string, unknown> } | { error: string; status: number }> {
  const patch: Record<string, unknown> = {};

  if ('label' in details) {
    patch.label = typeof details.label === 'string' && details.label.trim() ? details.label.trim() : null;
  }
  if ('notes' in details) {
    patch.notes = typeof details.notes === 'string' && details.notes.trim() ? details.notes.trim() : null;
  }
  if ('room_id' in details) {
    patch.room_id = typeof details.room_id === 'string' && details.room_id.trim() ? details.room_id.trim() : null;
  }
  if ('shift_type' in details) {
    if (!SHIFT_TYPES.includes(details.shift_type as ShiftType)) return { error: 'Invalid shift type', status: 400 };
    patch.shift_type = details.shift_type;
  }

  const start = new Date(typeof details.starts_at === 'string' ? details.starts_at : shift.starts_at);
  const end = new Date(typeof details.ends_at === 'string' ? details.ends_at : shift.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'A valid start and end time are required', status: 400 };
  }
  if (end <= start) return { error: 'The shift must end after it starts', status: 400 };
  if ('starts_at' in details) patch.starts_at = start.toISOString();
  if ('ends_at' in details) patch.ends_at = end.toISOString();

  let newTeamId: string | null = null;
  if (typeof details.team_id === 'string' && details.team_id && details.team_id !== shift.team_id) {
    const team = await loadSchedulableTeam(supabase, scope, details.team_id);
    if (!team) return { error: 'That group is not one of yours', status: 403 };

    const { count } = await supabase
      .from('shift_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('shift_id', shift.id)
      .neq('attendance_status', 'scheduled');
    if ((count ?? 0) > 0) {
      return { error: 'Attendance has already been marked, so the group can no longer change', status: 409 };
    }
    patch.team_id = team.id;
    patch.section_id = team.section_id;
    newTeamId = team.id;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('shifts').update(patch).eq('id', shift.id);
    if (error) {
      if (isMissingTeamColumn(error)) {
        return { error: 'Moving a shift to another group needs migration 064', status: 409 };
      }
      console.error('Failed to edit shift', error);
      return { error: 'Unable to update the shift', status: 500 };
    }
  }

  if (newTeamId) {
    const students = await teamStudentIds(supabase, newTeamId);
    const { error: clearError } = await supabase.from('shift_assignments').delete().eq('shift_id', shift.id);
    if (clearError) {
      console.error('Failed to clear the old roster', clearError);
      return { error: 'Unable to swap the roster', status: 500 };
    }
    if (students.length > 0) {
      const { error: assignError } = await supabase.from('shift_assignments').insert(
        students.map((studentId) => ({ shift_id: shift.id, student_id: studentId, assigned_by: session.uid })),
      );
      if (assignError) {
        console.error('Failed to roster the new group', assignError);
        return { error: 'Unable to roster the new group', status: 500 };
      }
    }
  }

  return { changes: patch };
}

/** DELETE — removes the shift; its assignments cascade. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const supabase = getSupabaseAdmin();
    const scoped = await loadScopedShift(supabase, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    }

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete shift', error);
      return NextResponse.json({ error: 'Unable to delete the shift' }, { status: 500 });
    }

    await logAudit(session, { action: 'shift.delete', entityType: 'shifts', entityId: id }, request);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete shift failed', err);
    return NextResponse.json({ error: 'Unable to delete the shift' }, { status: 500 });
  }
}
