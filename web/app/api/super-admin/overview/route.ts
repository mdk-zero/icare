import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';

const WEEKS = 8;

/** Everything the super admin dashboard shows, in one round-trip. */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const [accounts, metrics, runs] = await Promise.all([
    supabase.from('users').select('role, created_at, last_login_at').limit(20000),
    supabase.rpc('super_admin_metrics_summary', { p_since: since24h, p_bucket: 'hour' }),
    supabase
      .from('system_test_runs')
      .select('id, kind, created_at, summary')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  if (accounts.error) {
    console.error('Overview: failed to read accounts', accounts.error);
    return NextResponse.json({ error: 'Unable to load the dashboard' }, { status: 500 });
  }

  const now = Date.now();
  const byRole: Record<string, number> = { student: 0, faculty: 0, admin: 0, super_admin: 0 };
  let active7d = 0;
  // Monday-started weeks, oldest first.
  const weekStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const thisWeek = weekStart(new Date());
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (WEEKS - 1 - i) * 7);
    return { t: start.toISOString(), count: 0 };
  });
  const firstWeek = new Date(weeks[0].t).getTime();

  for (const u of accounts.data ?? []) {
    byRole[u.role as string] = (byRole[u.role as string] ?? 0) + 1;
    if (u.last_login_at && now - new Date(u.last_login_at as string).getTime() < 7 * 86_400_000) active7d += 1;
    const created = new Date(u.created_at as string).getTime();
    if (created >= firstWeek) {
      const index = Math.floor((created - firstWeek) / (7 * 86_400_000));
      if (weeks[index]) weeks[index].count += 1;
    }
  }

  const pending = isMissingMigration(metrics.error) || isMissingMigration(runs.error);
  const latest = (kind: string) => (runs.data ?? []).find((r) => r.kind === kind) ?? null;

  return NextResponse.json({
    accounts: { total: (accounts.data ?? []).length, by_role: byRole, active_7d: active7d, new_per_week: weeks },
    metrics: metrics.error ? null : metrics.data,
    latest_runs: {
      health: latest('health'),
      benchmark: latest('benchmark'),
      dw_benchmark: latest('dw_benchmark'),
    },
    pending_migration: pending,
  });
}
