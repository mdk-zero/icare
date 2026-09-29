import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

/**
 * Bulk-saves the floor plan. Each `positions` entry either places a room
 * (x/y/w/h in grid units, plus an optional door wall) or removes it from the
 * plan (all four null). `fixtures`, when sent, is the plan's whole set of
 * corridors, stations and labels (migration 062): listed ones are saved, any
 * others deleted.
 * Overlap between rooms is the editor's concern — the server only guards the
 * shape invariants the DB constraint (035) also enforces, so a stale client
 * gets a clean 400 instead of a raw constraint error.
 */

const DOOR_SIDES = ['n', 'e', 's', 'w'] as const;
type DoorSide = (typeof DOOR_SIDES)[number];

const FIXTURE_KINDS = [
  'corridor',
  'nurse_station',
  'stairs',
  'elevator',
  'restroom',
  'storage',
  'label',
] as const;
const MAX_FIXTURES = 200;
const MAX_FIXTURE_LABEL = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEEDS_062 = 'Doors and fixtures need database migration 062 (ward_floor_plan) applied first.';

interface Placement {
  id: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  door?: DoorSide;
}

interface Fixture {
  id: string;
  kind: string;
  label: string;
  plan_x: number;
  plan_y: number;
  plan_w: number;
  plan_h: number;
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && w >= 1 && h >= 1 && x + w <= 100 && y + h <= 100;
}

function isDoorSide(raw: unknown): raw is DoorSide {
  return DOOR_SIDES.includes(raw as DoorSide);
}

function parseFixture(raw: unknown): Fixture | string {
  if (!raw || typeof raw !== 'object') return 'Each fixture must be an object';
  const f = raw as Record<string, unknown>;
  if (typeof f.id !== 'string' || !UUID.test(f.id)) return 'Each fixture needs a uuid id';
  if (!FIXTURE_KINDS.includes(f.kind as (typeof FIXTURE_KINDS)[number])) return 'Unknown fixture kind';
  const label = typeof f.label === 'string' ? f.label.trim() : '';
  if (label.length > MAX_FIXTURE_LABEL) return `Fixture labels are at most ${MAX_FIXTURE_LABEL} characters`;
  const nums = [f.plan_x, f.plan_y, f.plan_w, f.plan_h];
  if (!nums.every((v) => typeof v === 'number' && Number.isInteger(v))) {
    return 'Fixture coordinates must be integers';
  }
  const [x, y, w, h] = nums as number[];
  if (!inBounds(x, y, w, h)) return 'Fixture is out of bounds';
  return { id: f.id, kind: f.kind as string, label, plan_x: x, plan_y: y, plan_w: w, plan_h: h };
}

/** The column or table from migration 062 is not there yet. */
function isMissing062(error: { code?: string }): boolean {
  return ['42703', 'PGRST204', '42P01', 'PGRST205'].includes(error.code ?? '');
}

function parsePlacement(raw: unknown): Placement | string {
  if (!raw || typeof raw !== 'object') return 'Each position must be an object';
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id.trim()) return 'Each position needs a room id';

  if (p.door != null && !isDoorSide(p.door)) return 'door must be one of n, e, s, w';
  const door = isDoorSide(p.door) ? p.door : undefined;

  const nums = [p.x, p.y, p.w, p.h];
  const nulls = nums.filter((v) => v === null || v === undefined).length;
  if (nulls === 4) return { id: p.id, x: null, y: null, w: null, h: null };
  if (nulls !== 0) return 'A placement must set all of x/y/w/h, or none to unplace';
  if (!nums.every((v) => typeof v === 'number' && Number.isInteger(v))) {
    return 'Placement coordinates must be integers';
  }
  const [x, y, w, h] = nums as number[];
  if (!inBounds(x, y, w, h)) return 'Placement is out of bounds';
  return { id: p.id, x, y, w, h, ...(door ? { door } : {}) };
}

export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { positions?: unknown; fixtures?: unknown };
  try {
    body = (await request.json()) as { positions?: unknown; fixtures?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hasFixtures = body.fixtures !== undefined;
  if (!Array.isArray(body.positions) || (body.positions.length === 0 && !hasFixtures)) {
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

  const fixtures: Fixture[] = [];
  if (hasFixtures) {
    if (!Array.isArray(body.fixtures) || body.fixtures.length > MAX_FIXTURES) {
      return NextResponse.json({ error: `fixtures must be an array of at most ${MAX_FIXTURES}` }, { status: 400 });
    }
    const seenFixtures = new Set<string>();
    for (const raw of body.fixtures) {
      const parsed = parseFixture(raw);
      if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
      if (seenFixtures.has(parsed.id)) {
        return NextResponse.json({ error: 'Duplicate fixture in fixtures' }, { status: 400 });
      }
      seenFixtures.add(parsed.id);
      fixtures.push(parsed);
    }
  }

  try {
    const supabase = getSupabaseAdmin();

    // No bulk upsert here: upsert would need every not-null column of the row,
    // and a partial failure should name the room it tripped on.
    for (const p of placements) {
      const { error } = await supabase
        .from('rooms')
        .update({
          plan_x: p.x,
          plan_y: p.y,
          plan_w: p.w,
          plan_h: p.h,
          ...(p.door ? { plan_door: p.door } : {}),
        })
        .eq('id', p.id);
      if (error) {
        if (p.door && isMissing062(error)) {
          return NextResponse.json({ error: NEEDS_062 }, { status: 503 });
        }
        console.error('Failed to save room placement', p.id, error);
        return NextResponse.json(
          { error: 'Unable to save the floor plan; some rooms may not have been updated' },
          { status: 500 },
        );
      }
    }

    if (hasFixtures) {
      const fixtureError = await replaceFixtures(supabase, fixtures, session.uid);
      if (fixtureError) {
        return NextResponse.json(
          { error: fixtureError === 'missing' ? NEEDS_062 : 'Unable to save the plan\'s fixtures; rooms were saved' },
          { status: fixtureError === 'missing' ? 503 : 500 },
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
          ...(hasFixtures ? { fixtures: fixtures.length } : {}),
        },
      },
      request,
    );

    return NextResponse.json({ saved: placements.length + fixtures.length });
  } catch (err) {
    console.error('Save floor plan failed', err);
    return NextResponse.json({ error: 'Unable to save the floor plan' }, { status: 500 });
  }
}

/**
 * Makes the stored fixtures exactly `fixtures`: deletes the rest, updates the
 * ones that exist, and inserts the new ones under the saving dean's name.
 */
async function replaceFixtures(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fixtures: Fixture[],
  uid: string,
): Promise<'missing' | 'failed' | null> {
  const fail = (error: { code?: string }, what: string) => {
    if (isMissing062(error)) return 'missing' as const;
    console.error(`Failed to ${what} ward fixtures`, error);
    return 'failed' as const;
  };

  const { data: existing, error: readError } = await supabase.from('ward_fixtures').select('id');
  if (readError) return fail(readError, 'read');
  const existingIds = new Set((existing ?? []).map((f) => f.id as string));
  const keep = new Set(fixtures.map((f) => f.id));

  const removed = [...existingIds].filter((id) => !keep.has(id));
  if (removed.length > 0) {
    const { error } = await supabase.from('ward_fixtures').delete().in('id', removed);
    if (error) return fail(error, 'delete');
  }

  const updates = fixtures.filter((f) => existingIds.has(f.id));
  if (updates.length > 0) {
    const { error } = await supabase.from('ward_fixtures').upsert(updates, { onConflict: 'id' });
    if (error) return fail(error, 'update');
  }

  const inserts = fixtures.filter((f) => !existingIds.has(f.id));
  if (inserts.length > 0) {
    const { error } = await supabase
      .from('ward_fixtures')
      .insert(inserts.map((f) => ({ ...f, created_by: uid })));
    if (error) return fail(error, 'insert');
  }
  return null;
}
