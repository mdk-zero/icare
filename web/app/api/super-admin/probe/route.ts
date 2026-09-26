import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Load-benchmark targets. Each is one representative read with no side
 * effects, so the benchmark can hammer it without changing anything:
 *   auth — session verification plus the live-role lookup every guarded route does
 *   db   — a transactional read (a page of the users table)
 *   dw   — the analytical dashboard query the warehouse serves
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const target = request.nextUrl.searchParams.get('target');
  const supabase = getSupabaseAdmin();

  if (target === 'auth') return NextResponse.json({ ok: true }, { headers: NO_STORE });

  if (target === 'db') {
    const { error } = await supabase.from('users').select('id, name, role').order('created_at').limit(50);
    return NextResponse.json({ ok: !error }, { status: error ? 500 : 200, headers: NO_STORE });
  }

  if (target === 'dw') {
    const { error } = await supabase.rpc('dw_analytics_summary');
    return NextResponse.json({ ok: !error }, { status: error ? 500 : 200, headers: NO_STORE });
  }

  return NextResponse.json({ error: 'Unknown target' }, { status: 400 });
}
