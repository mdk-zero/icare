import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { saveTestRun } from '@/app/lib/system-tests';

const KINDS = ['benchmark', 'dw_benchmark', 'health', 'e2e', 'api'];

/** Recent runs, newest first, optionally of one kind. */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const kind = request.nextUrl.searchParams.get('kind');
  let query = getSupabaseAdmin()
    .from('system_test_runs')
    .select('id, kind, created_at, summary, results, users:run_by(name)')
    .order('created_at', { ascending: false })
    .limit(kind ? 20 : 100);
  if (kind && KINDS.includes(kind)) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ runs: [], pending_migration: true });
    console.error('Failed to list test runs', error);
    return NextResponse.json({ error: 'Unable to list test runs' }, { status: 500 });
  }
  const runs = (data ?? []).map(({ users, ...run }) => ({
    ...run,
    run_by_name: (users as unknown as { name?: string } | null)?.name ?? null,
  }));
  return NextResponse.json({ runs });
}

interface BenchmarkRow {
  target: string;
  concurrency: number;
  requests: number;
  ok: number;
  p50_ms: number;
  p95_ms: number;
  avg_ms: number;
  rps: number;
}

interface SuiteCase {
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error: string | null;
}

const SUITE_STATUSES = ['passed', 'failed', 'skipped'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

/**
 * A Playwright or Postman run reported by web/tests/report.mjs. The suites
 * run on a developer machine or in CI, never on the server, so this only
 * checks the shape and keeps it.
 */
async function saveSuiteRun(kind: 'e2e' | 'api', body: Record<string, unknown>, runBy: string) {
  if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > 1000) {
    return NextResponse.json({ error: 'Invalid test results' }, { status: 400 });
  }
  const results: SuiteCase[] = [];
  for (const raw of body.results) {
    const r = raw as Record<string, unknown>;
    const status = r.status as SuiteCase['status'];
    const duration = Number(r.duration_ms);
    const name = str(r.name, 300);
    if (!name || !SUITE_STATUSES.includes(status) || !Number.isFinite(duration) || duration < 0) {
      return NextResponse.json({ error: 'Invalid test results' }, { status: 400 });
    }
    results.push({
      suite: str(r.suite, 200) ?? '',
      name,
      status,
      duration_ms: Math.round(duration),
      error: str(r.error, 2000),
    });
  }
  const meta = (body.meta ?? {}) as Record<string, unknown>;
  const count = (status: string) => results.filter((r) => r.status === status).length;
  const summary = {
    total: results.length,
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
    duration_ms: Math.round(Number(meta.duration_ms) || results.reduce((sum, r) => sum + r.duration_ms, 0)),
    base_url: str(meta.base_url, 200),
    runner: str(meta.runner, 80),
    commit: str(meta.commit, 40),
  };
  const saved = await saveTestRun(getSupabaseAdmin(), { kind, runBy, summary, results });
  return NextResponse.json({
    run: { id: saved.id, kind, created_at: new Date().toISOString(), summary, results },
    saved: saved.saved,
  });
}

/**
 * Saves a finished run: a load benchmark the browser ran, or (kind e2e/api)
 * a test-suite report. The server only checks the shape.
 */
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => null)) as ({ results?: unknown; kind?: unknown } & Record<string, unknown>) | null;
  if (body && (body.kind === 'e2e' || body.kind === 'api')) {
    return saveSuiteRun(body.kind, body, guard.session.uid);
  }
  if (!body || !Array.isArray(body.results) || body.results.length === 0 || body.results.length > 64) {
    return NextResponse.json({ error: 'Invalid benchmark results' }, { status: 400 });
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const results: BenchmarkRow[] = [];
  for (const raw of body.results) {
    const r = raw as Record<string, unknown>;
    const row = {
      target: typeof r.target === 'string' ? r.target.slice(0, 40) : null,
      concurrency: num(r.concurrency),
      requests: num(r.requests),
      ok: num(r.ok),
      p50_ms: num(r.p50_ms),
      p95_ms: num(r.p95_ms),
      avg_ms: num(r.avg_ms),
      rps: num(r.rps),
    };
    if (Object.values(row).some((v) => v === null)) {
      return NextResponse.json({ error: 'Invalid benchmark results' }, { status: 400 });
    }
    results.push(row as BenchmarkRow);
  }

  const requests = results.reduce((sum, r) => sum + r.requests, 0);
  const ok = results.reduce((sum, r) => sum + r.ok, 0);
  const summary = {
    requests,
    success_pct: requests ? Math.round((ok / requests) * 1000) / 10 : 0,
    worst_p95_ms: Math.max(...results.map((r) => r.p95_ms)),
    peak_rps: Math.max(...results.map((r) => r.rps)),
    max_concurrency: Math.max(...results.map((r) => r.concurrency)),
  };

  const saved = await saveTestRun(getSupabaseAdmin(), {
    kind: 'benchmark',
    runBy: guard.session.uid,
    summary,
    results,
  });
  return NextResponse.json({
    run: { id: saved.id, kind: 'benchmark', created_at: new Date().toISOString(), summary, results },
    saved: saved.saved,
  });
}
