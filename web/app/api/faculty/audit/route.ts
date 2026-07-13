import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

// The audit trail is append-only (manuscript F7: unalterable activity
// logging) — reads and inserts only, no update or delete surface.

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
      .from('faculty_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (action && action !== 'all') {
      query = query.ilike('action', `%${action}%`);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('Failed to fetch audit logs', error);
      return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
    }

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

  const { faculty_id, faculty_name, tab, action, details, target_type, target_id, metadata } =
    body as {
      faculty_id?: unknown;
      faculty_name?: unknown;
      tab?: unknown;
      action?: unknown;
      details?: unknown;
      target_type?: unknown;
      target_id?: unknown;
      metadata?: unknown;
    };

  if (
    typeof faculty_id !== 'string' ||
    typeof faculty_name !== 'string' ||
    typeof tab !== 'string' ||
    typeof action !== 'string' ||
    typeof details !== 'string'
  ) {
    return NextResponse.json(
      { error: 'faculty_id, faculty_name, tab, action, and details are required' },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: log, error } = await supabase
      .from('faculty_audit_logs')
      .insert({
        faculty_id,
        faculty_name,
        tab,
        action,
        details,
        target_type: target_type ?? null,
        target_id: target_id ?? null,
        metadata: metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      console.error('Failed to insert audit log', error);
      return NextResponse.json({ error: 'Unable to create audit log' }, { status: 500 });
    }

    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    console.error('Create audit log failed', err);
    return NextResponse.json({ error: 'Unable to create audit log' }, { status: 500 });
  }
}
