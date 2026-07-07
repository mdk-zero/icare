import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

const validStatuses = ['active', 'inactive', 'maintenance'] as const;

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: rooms, error: roomsError }, { data: assignments, error: asgError }] =
      await Promise.all([
        supabase.from('rooms').select('*').order('room_number'),
        supabase.from('room_assignments').select('room_id').is('ends_at', null),
      ]);

    if (roomsError || asgError) {
      console.error('Failed to fetch rooms', roomsError ?? asgError);
      return NextResponse.json({ error: 'Unable to fetch rooms' }, { status: 500 });
    }

    const occupancy = new Map<string, number>();
    for (const { room_id } of assignments ?? []) {
      occupancy.set(room_id, (occupancy.get(room_id) ?? 0) + 1);
    }

    return NextResponse.json({
      rooms: (rooms ?? []).map((room) => ({
        ...room,
        students_assigned: occupancy.get(room.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error('Fetch rooms failed', err);
    return NextResponse.json({ error: 'Unable to fetch rooms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, room_number, capacity, status, description } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
  }
  if (typeof room_number !== 'string' || room_number.trim().length === 0) {
    return NextResponse.json({ error: 'Room number is required' }, { status: 400 });
  }
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 0) {
    return NextResponse.json({ error: 'Capacity must be a non-negative integer' }, { status: 400 });
  }
  const roomStatus = status ?? 'active';
  if (!validStatuses.includes(roomStatus as (typeof validStatuses)[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: campus } = await supabase.from('campuses').select('id').limit(1).single();

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        campus_id: campus?.id ?? null,
        name: name.trim(),
        room_number: room_number.trim(),
        capacity: cap,
        status: roomStatus,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
      })
      .select()
      .single();

    if (error || !room) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'A room with this number already exists' }, { status: 409 });
      }
      console.error('Failed to create room', error);
      return NextResponse.json({ error: 'Unable to create room' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'room.create',
        entityType: 'rooms',
        entityId: room.id,
        details: { name: room.name, room_number: room.room_number },
      },
      request,
    );

    return NextResponse.json({ room: { ...room, students_assigned: 0 } }, { status: 201 });
  } catch (err) {
    console.error('Create room failed', err);
    return NextResponse.json({ error: 'Unable to create room' }, { status: 500 });
  }
}
