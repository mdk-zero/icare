import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { saveTestRun } from '@/app/lib/system-tests';

interface QueryTiming {
  query_id: string;
  label: string;
  duration_ms: number | null;
  row_count: number | null;
  error: string | null;
}

/**
 * Times the six warehouse workloads of supabase/benchmarks/dw_benchmark.sql
 * inside the database (manuscript Table III), and keeps the run.
 */
export async function POST() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('super_admin_dw_benchmark');
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ pending_migration: true });
    console.error('DW benchmark failed', error);
    return NextResponse.json({ error: 'The benchmark could not run' }, { status: 500 });
  }

  const results = (data ?? []) as QueryTiming[];
  const timed = results.filter((r) => r.duration_ms !== null);
  const summary = {
    queries: results.length,
    failed: results.length - timed.length,
    total_ms: Math.round(timed.reduce((sum, r) => sum + Number(r.duration_ms), 0) * 100) / 100,
    slowest: timed.length
      ? timed.reduce((a, b) => (Number(b.duration_ms) > Number(a.duration_ms) ? b : a)).query_id
      : null,
  };
  const saved = await saveTestRun(supabase, { kind: 'dw_benchmark', runBy: guard.session.uid, summary, results });
  return NextResponse.json({
    run: { id: saved.id, kind: 'dw_benchmark', created_at: new Date().toISOString(), summary, results },
    saved: saved.saved,
  });
}
