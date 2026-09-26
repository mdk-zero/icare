import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { checkRateLimit } from '@/app/lib/auth/rate-limit';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration } from '@/app/lib/auth/super-admin';
import { normalizeRoute } from '@/app/lib/request-metrics';

/**
 * Ingest for client request telemetry (app/lib/telemetry.ts, migration 054).
 * Signed-in callers only, bounded per batch and per minute, and every field
 * is re-derived or clamped here: the client only reports what it saw.
 */
const MAX_SAMPLES = 100;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SOURCES = new Set(['web', 'mobile']);

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = checkRateLimit(`metrics:${session.uid}`, 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { samples?: unknown; source?: unknown } | null;
  if (!body || !Array.isArray(body.samples)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const source = typeof body.source === 'string' && SOURCES.has(body.source) ? body.source : 'web';
  const now = Date.now();

  const rows = [];
  for (const raw of body.samples.slice(0, MAX_SAMPLES)) {
    const s = raw as Record<string, unknown>;
    const method = typeof s.method === 'string' ? s.method.toUpperCase() : '';
    const route = typeof s.path === 'string' ? normalizeRoute(s.path) : null;
    const status = Number(s.status);
    const duration = Number(s.duration_ms);
    if (!METHODS.has(method) || !route) continue;
    if (!Number.isInteger(status) || status < 0 || status > 599) continue;
    if (!Number.isFinite(duration) || duration < 0 || duration > 300_000) continue;
    // Accept the client's timestamp only within the last hour; otherwise now.
    const at = Number(s.at);
    const recordedAt = Number.isFinite(at) && at <= now && now - at < 3_600_000 ? at : now;
    rows.push({
      method,
      route,
      status,
      duration_ms: Math.round(duration),
      source,
      role: session.role,
      recorded_at: new Date(recordedAt).toISOString(),
    });
  }
  if (rows.length === 0) return NextResponse.json({ accepted: 0 });

  const { error } = await getSupabaseAdmin().from('request_metrics').insert(rows);
  if (error) {
    // Before 054 there's nowhere to put them; drop quietly.
    if (!isMissingMigration(error)) console.error('Failed to store request metrics', error);
    return NextResponse.json({ accepted: 0 });
  }
  return NextResponse.json({ accepted: rows.length });
}
