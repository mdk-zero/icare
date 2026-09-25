import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultySectionIds, getFacultyStudentIds } from '@/app/lib/roster';
import { logAudit } from '@/app/lib/audit';
import { SHIFT_ATTENDANCE_LABEL, type ShiftAttendanceStatus } from '@/app/lib/shifts';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ATTENDANCE_VALUES = Object.keys(SHIFT_ATTENDANCE_LABEL) as ShiftAttendanceStatus[];

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

/** Loads the shift and refuses one outside the caller's sections. */
async function loadScopedShift(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  id: string,
) {
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, section_id, label, shift_type, starts_at, ends_at, status, notes, room_id, section:sections(id, name), room:rooms(id, name, room_number)')
    .eq('id', id)
    .maybeSingle();

  if (!shift) return { error: 'Shift not found', status: 404 as const };
  if (session.role !== 'admin') {
    const mine = await getFacultySectionIds(supabase, session.uid);
    if (!shift.section_id || !mine.includes(shift.section_id)) {
      return { error: 'That shift is not one of yours', status: 403 as const };
    }
  }
  return { shift };
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
    const scoped = await loadScopedShift(supabase, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    }

    const { data: roster, error } = await supabase
      .from('shift_assignments')
      // Explicit FK hint: shift_assignments points at users twice (student_id
      // and assigned_by), so a bare users(...) embed is ambiguous and errors.
      .select(
        'id, student_id, attendance_status, checked_in_at, notes, users!shift_assignments_student_id_fkey(name, email)',
      )
      .eq('shift_id', id);

    if (error) {
      console.error('Failed to load shift roster', error);
      return NextResponse.json({ error: 'Unable to load the roster' }, { status: 500 });
    }

    // Faculty see only the members of the groups they supervise.
    const mine = session.role === 'faculty' ? new Set(await getFacultyStudentIds(supabase, session.uid)) : null;

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
 * PATCH — marks attendance, and/or cancels or reinstates the shift.
 *
 *   { marks: [{ assignment_id, status, notes? }] }   attendance
 *   { status: 'cancelled' | 'scheduled' }            the shift itself
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  let body: { marks?: unknown; status?: unknown };
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
    const mine = session.role === 'faculty' && marks.length > 0
      ? await getFacultyStudentIds(supabase, session.uid)
      : null;
    let updated = 0;
    for (const raw of marks) {
      if (!raw || typeof raw !== 'object') continue;
      const mark = raw as Record<string, unknown>;
      const assignmentId = typeof mark.assignment_id === 'string' ? mark.assignment_id : '';
      const status = mark.status as ShiftAttendanceStatus;
      if (!assignmentId || !ATTENDANCE_VALUES.includes(status)) continue;

      // Marking someone present or late stamps their arrival if nothing has
      // yet; clearing back to scheduled drops it, so the two never disagree.
      const patch: Record<string, unknown> = { attendance_status: status };
      if (status === 'present' || status === 'late') {
        patch.checked_in_at = new Date().toISOString();
      } else if (status === 'scheduled') {
        patch.checked_in_at = null;
      }
      if (typeof mark.notes === 'string') patch.notes = mark.notes.trim() || null;

      // `select` so the count reflects rows actually changed. An update that
      // matches nothing is not an error in PostgREST, so without this an
      // unknown or foreign assignment id would be reported back as marked.
      let update = supabase
        .from('shift_assignments')
        .update(patch)
        .eq('id', assignmentId)
        .eq('shift_id', id); // scoping guard: an id from another shift matches nothing
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
