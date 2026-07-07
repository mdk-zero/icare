import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

const validStatuses = ['active', 'inactive', 'maintenance'] as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: room, error: roomError }, { data: assignments, error: asgError }] =
      await Promise.all([
        supabase.from('rooms').select('*').eq('id', id).single(),
        supabase
          .from('room_assignments')
          .select('id, student_id, shift, starts_at, ends_at, users!room_assignments_student_id_fkey(name, email)')
          .eq('room_id', id)
          .is('ends_at', null)
          .order('starts_at', { ascending: false }),
      ]);

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (asgError) {
      console.error('Failed to fetch room assignments', asgError);
      return NextResponse.json({ error: 'Unable to fetch room' }, { status: 500 });
    }

    return NextResponse.json({ room, assignments: assignments ?? [] });
  } catch (err) {
    console.error('Fetch room failed', err);
    return NextResponse.json({ error: 'Unable to fetch room' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, room_number, capacity, status, description } = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Room name cannot be empty' }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (room_number !== undefined) {
    if (typeof room_number !== 'string' || room_number.trim().length === 0) {
      return NextResponse.json({ error: 'Room number cannot be empty' }, { status: 400 });
    }
    updates.room_number = room_number.trim();
  }
  if (capacity !== undefined) {
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 0) {
      return NextResponse.json({ error: 'Capacity must be a non-negative integer' }, { status: 400 });
    }
    updates.capacity = cap;
  }
  if (status !== undefined) {
    if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status;
  }
  if (description !== undefined) {
    updates.description =
      typeof description === 'string' && description.trim() ? description.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: room, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !room) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'A room with this number already exists' }, { status: 409 });
      }
      console.error('Failed to update room', error);
      return NextResponse.json({ error: 'Unable to update room' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'room.update',
        entityType: 'rooms',
        entityId: room.id,
        details: { updates },
      },
      request,
    );

    return NextResponse.json({ room });
  } catch (err) {
    console.error('Update room failed', err);
    return NextResponse.json({ error: 'Unable to update room' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('rooms').delete().eq('id', id);

    if (error) {
      console.error('Failed to delete room', error);
      return NextResponse.json({ error: 'Unable to delete room' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'room.delete', entityType: 'rooms', entityId: id },
      request,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete room failed', err);
    return NextResponse.json({ error: 'Unable to delete room' }, { status: 500 });
  }
}
