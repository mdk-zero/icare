import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

/**
 * Bulk-saves floor-plan placement for rooms. Each entry either places a room
 * (x/y/w/h in grid units) or removes it from the plan (all four null).
 * Overlap between rooms is the editor's concern — the server only guards the
 * shape invariants the DB constraint (035) also enforces, so a stale client
 * gets a clean 400 instead of a raw constraint error.
 */

interface Placement {
  id: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
}

function parsePlacement(raw: unknown): Placement | string {
  if (!raw || typeof raw !== 'object') return 'Each position must be an object';
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id.trim()) return 'Each position needs a room id';

  const nums = [p.x, p.y, p.w, p.h];
  const nulls = nums.filter((v) => v === null || v === undefined).length;
  if (nulls === 4) return { id: p.id, x: null, y: null, w: null, h: null };
  if (nulls !== 0) return 'A placement must set all of x/y/w/h, or none to unplace';
  if (!nums.every((v) => typeof v === 'number' && Number.isInteger(v))) {
    return 'Placement coordinates must be integers';
  }
  const [x, y, w, h] = nums as number[];
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > 100 || y + h > 100) {
    return 'Placement is out of bounds';
  }
  return { id: p.id, x, y, w, h };
}

export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { positions?: unknown };
  try {
    body = (await request.json()) as { positions?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.positions) || body.positions.length === 0) {
    return NextResponse.json({ error: 'positions array is required' }, { status: 400 });
  }
  if (body.positions.length > 200) {
    return NextResponse.json({ error: 'Too many positions in one request' }, { status: 400 });
  }

  const placements: Placement[] = [];
  const seen = new Set<string>();
  for (const raw of body.positions) {
    const parsed = parsePlacement(raw);
    if (typeof parsed === 'string') {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }
    if (seen.has(parsed.id)) {
      return NextResponse.json({ error: 'Duplicate room in positions' }, { status: 400 });
    }
    seen.add(parsed.id);
    placements.push(parsed);
  }

  try {
    const supabase = getSupabaseAdmin();

    // No bulk upsert here: upsert would need every not-null column of the row,
    // and a partial failure should name the room it tripped on.
    for (const p of placements) {
      const { error } = await supabase
        .from('rooms')
        .update({ plan_x: p.x, plan_y: p.y, plan_w: p.w, plan_h: p.h })
        .eq('id', p.id);
      if (error) {
        console.error('Failed to save room placement', p.id, error);
        return NextResponse.json(
          { error: 'Unable to save the floor plan; some rooms may not have been updated' },
          { status: 500 },
        );
      }
    }

    await logAudit(
      session,
      {
        action: 'room.layout.update',
        entityType: 'rooms',
        details: {
          placed: placements.filter((p) => p.x !== null).length,
          unplaced: placements.filter((p) => p.x === null).length,
        },
      },
      request,
    );

    return NextResponse.json({ saved: placements.length });
  } catch (err) {
    console.error('Save floor plan failed', err);
    return NextResponse.json({ error: 'Unable to save the floor plan' }, { status: 500 });
  }
}
