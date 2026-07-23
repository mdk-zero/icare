import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * Places a set of patients into rooms without exceeding any room's capacity.
 * Used by library generation to auto-assign the grounded patients. The given
 * patients are re-placed from scratch (their current rooms are ignored, freeing
 * those beds); everyone else's occupancy is held fixed. Overflow (no room with
 * space) is left unassigned (room_id null).
 *
 *   mode "fill"   — fill rooms to capacity in room-number order.
 *   mode "spread" — balance load, always adding to the least-full room with space.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { patient_ids?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as { patient_ids?: unknown; mode?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patientIds = Array.isArray(body.patient_ids)
    ? body.patient_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const mode = body.mode === 'spread' ? 'spread' : 'fill';
  if (patientIds.length === 0) {
    return NextResponse.json({ assigned: 0, unassigned: 0 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: roomRows } = await supabase
      .from('rooms')
      .select('id, name, room_number, capacity')
      .order('room_number');
    const rooms = (roomRows ?? []) as {
      id: string;
      name: string;
      room_number: string;
      capacity: number;
    }[];

    // Occupancy from everyone NOT being re-placed, so the target set's own beds free up.
    const targetSet = new Set(patientIds);
    const { data: allPatients } = await supabase.from('patients').select('id, room_id');
    const occupancy = new Map<string, number>();
    for (const p of (allPatients ?? []) as { id: string; room_id: string | null }[]) {
      if (p.room_id && !targetSet.has(p.id)) {
        occupancy.set(p.room_id, (occupancy.get(p.room_id) ?? 0) + 1);
      }
    }

    // room_id (or "" for unassigned overflow) -> patient ids to write there.
    const buckets = new Map<string, string[]>();
    const push = (key: string, id: string) => {
      const list = buckets.get(key) ?? [];
      list.push(id);
      buckets.set(key, list);
    };

    for (const patientId of patientIds) {
      let target: (typeof rooms)[number] | null = null;
      if (mode === 'fill') {
        target = rooms.find((r) => (occupancy.get(r.id) ?? 0) < r.capacity) ?? null;
      } else {
        let bestRatio = Infinity;
        for (const room of rooms) {
          const occ = occupancy.get(room.id) ?? 0;
          if (occ >= room.capacity) continue;
          const ratio = occ / room.capacity;
          if (ratio < bestRatio) {
            bestRatio = ratio;
            target = room;
          }
        }
      }
      if (target) {
        occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1);
        push(target.id, patientId);
      } else {
        push('', patientId);
      }
    }

    const roomById = new Map(rooms.map((r) => [r.id, r]));
    let assigned = 0;
    let unassigned = 0;
    for (const [key, ids] of buckets) {
      if (ids.length === 0) continue;
      if (key === '') {
        await supabase.from('patients').update({ room_id: null, room_number: '' }).in('id', ids);
        unassigned += ids.length;
      } else {
        const room = roomById.get(key)!;
        await supabase
          .from('patients')
          .update({ room_id: room.id, room_number: `${room.name} · Room ${room.room_number}` })
          .in('id', ids);
        assigned += ids.length;
      }
    }

    return NextResponse.json({ assigned, unassigned });
  } catch (err) {
    console.error('Assign patient rooms failed', err);
    return NextResponse.json({ error: 'Unable to assign rooms' }, { status: 500 });
  }
}
