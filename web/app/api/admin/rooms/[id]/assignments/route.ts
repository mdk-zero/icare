import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: roomId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_ids, shift } = body as { student_ids?: unknown; shift?: unknown };
  if (!Array.isArray(student_ids) || student_ids.length === 0 || !student_ids.every((s) => typeof s === 'string')) {
    return NextResponse.json({ error: 'student_ids must be a non-empty array' }, { status: 400 });
  }
  if (shift !== undefined && shift !== null && typeof shift !== 'string') {
    return NextResponse.json({ error: 'Invalid shift' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: room, error: roomError }, { data: current, error: curError }] =
      await Promise.all([
        supabase.from('rooms').select('id, name, capacity, status').eq('id', roomId).single(),
        supabase.from('room_assignments').select('student_id').eq('room_id', roomId).is('ends_at', null),
      ]);

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (curError) {
      console.error('Failed to fetch current assignments', curError);
      return NextResponse.json({ error: 'Unable to assign students' }, { status: 500 });
    }
    if (room.status !== 'active') {
      return NextResponse.json({ error: 'Room is not active' }, { status: 400 });
    }

    const alreadyAssigned = new Set((current ?? []).map((a) => a.student_id));
    const newIds = student_ids.filter((sid) => !alreadyAssigned.has(sid));
    if (newIds.length === 0) {
      return NextResponse.json({ error: 'All selected students are already assigned' }, { status: 400 });
    }
    if (room.capacity > 0 && alreadyAssigned.size + newIds.length > room.capacity) {
      return NextResponse.json(
        { error: `Room capacity exceeded (${alreadyAssigned.size}/${room.capacity} occupied)` },
        { status: 400 },
      );
    }

    const { data: students, error: studentError } = await supabase
      .from('users')
      .select('id')
      .in('id', newIds)
      .eq('role', 'student');
    if (studentError || (students ?? []).length !== newIds.length) {
      return NextResponse.json({ error: 'One or more students not found' }, { status: 400 });
    }

    const { data: assignments, error } = await supabase
      .from('room_assignments')
      .insert(
        newIds.map((studentId) => ({
          room_id: roomId,
          student_id: studentId,
          assigned_by: session.uid,
          shift: typeof shift === 'string' && shift.trim() ? shift.trim() : null,
        })),
      )
      .select('id, student_id, shift, starts_at, ends_at');

    if (error || !assignments) {
      console.error('Failed to create room assignments', error);
      return NextResponse.json({ error: 'Unable to assign students' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'room.assign_students',
        entityType: 'rooms',
        entityId: roomId,
        details: { room: room.name, student_ids: newIds, shift: shift ?? null },
      },
      request,
    );

    return NextResponse.json({ assignments }, { status: 201 });
  } catch (err) {
    console.error('Assign students failed', err);
    return NextResponse.json({ error: 'Unable to assign students' }, { status: 500 });
  }
}

/** Ends an active assignment (sets ends_at) rather than deleting the record. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: roomId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { assignment_id } = body as { assignment_id?: unknown };
  if (typeof assignment_id !== 'string' || assignment_id.length === 0) {
    return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: assignment, error } = await supabase
      .from('room_assignments')
      .update({ ends_at: new Date().toISOString() })
      .eq('id', assignment_id)
      .eq('room_id', roomId)
      .is('ends_at', null)
      .select('id, student_id')
      .single();

    if (error || !assignment) {
      return NextResponse.json({ error: 'Active assignment not found' }, { status: 404 });
    }

    await logAudit(
      session,
      {
        action: 'room.unassign_student',
        entityType: 'room_assignments',
        entityId: assignment.id,
        details: { room_id: roomId, student_id: assignment.student_id },
      },
      request,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('End room assignment failed', err);
    return NextResponse.json({ error: 'Unable to end assignment' }, { status: 500 });
  }
}
