import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

const MAX_LIMIT = 200;

/**
 * Full audit trail for the Dean (manuscript F7 / plan 2.8): every actor and
 * role, filterable by action text, actor role, entity type, and date range,
 * with offset pagination.
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const q = params.get('q')?.trim() ?? '';
  const role = params.get('role') ?? '';
  const entity = params.get('entity') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), MAX_LIMIT);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);

  try {
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('audit_logs')
      .select(
        'id, actor_id, actor_role, action, entity_type, entity_id, details, ip_address, created_at, actor:users(name, email)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.ilike('action', `%${q}%`);
    if (['student', 'faculty', 'admin'].includes(role)) query = query.eq('actor_role', role);
    if (entity) query = query.eq('entity_type', entity);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

    // Distinct entity types for the filter dropdown (recent window is enough).
    const [{ data: logs, error, count }, entityTypesRes] = await Promise.all([
      query,
      supabase
        .from('audit_logs')
        .select('entity_type')
        .not('entity_type', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (error) {
      console.error('Failed to fetch audit logs', error);
      return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
    }

    const entityTypes = [
      ...new Set((entityTypesRes.data ?? []).map((r) => r.entity_type as string)),
    ].sort();

    return NextResponse.json({
      logs: logs ?? [],
      total: count ?? 0,
      entity_types: entityTypes,
    });
  } catch (err) {
    console.error('Fetch audit logs failed', err);
    return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
  }
}
