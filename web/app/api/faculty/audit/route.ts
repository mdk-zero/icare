import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

// Backed by the canonical append-only audit_logs table (manuscript F7) —
// reads and inserts only, no update or delete surface. Faculty see their
// own activity; admins see the full trail.

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: { name: string } | null;
}

/** Human-readable summary for the page's Details column. */
function detailsText(details: Record<string, unknown>): string {
  if (typeof details.message === 'string') return details.message;
  const parts = Object.entries(details)
    .filter(([key, value]) => key !== 'migrated_from' && key !== 'actor_name' && value != null)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  return parts.join(', ');
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    let query = supabase
      .from('audit_logs')
      .select('id, actor_id, action, entity_type, entity_id, details, created_at, actor:users(name)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (session.role === 'faculty') {
      query = query.eq('actor_id', session.uid);
    }
    if (action && action !== 'all') {
      query = query.ilike('action', `%${action}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch audit logs', error);
      return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
    }

    const logs = ((data ?? []) as unknown as AuditLogRow[]).map((row) => ({
      id: row.id,
      faculty_id: row.actor_id ?? '',
      faculty_name:
        row.actor?.name ??
        (typeof row.details.actor_name === 'string' ? row.details.actor_name : 'System'),
      tab: row.entity_type ?? 'general',
      action: row.action,
      details: detailsText(row.details),
      target_id: row.entity_id,
      created_at: row.created_at,
    }));

    return NextResponse.json({ logs });
  } catch (err) {
    console.error('Fetch audit logs failed', err);
    return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The actor comes from the session — client-supplied identity is ignored.
  const { tab, action, details, target_type, target_id, metadata } = body as {
    tab?: unknown;
    action?: unknown;
    details?: unknown;
    target_type?: unknown;
    target_id?: unknown;
    metadata?: unknown;
  };

  if (typeof tab !== 'string' || typeof action !== 'string' || typeof details !== 'string') {
    return NextResponse.json(
      { error: 'tab, action, and details are required' },
      { status: 400 },
    );
  }

  await logAudit(
    session,
    {
      action,
      entityType: tab,
      entityId: typeof target_id === 'string' ? target_id : undefined,
      details: {
        message: details,
        ...(typeof target_type === 'string' ? { target_type } : {}),
        ...(metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}),
      },
    },
    request,
  );

  return NextResponse.json({ success: true }, { status: 201 });
}
