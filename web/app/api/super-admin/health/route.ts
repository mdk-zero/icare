import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { getProvider } from '@/app/lib/auth/email';
import { saveTestRun } from '@/app/lib/system-tests';

type Status = 'pass' | 'warn' | 'fail';

interface Check {
  id: string;
  label: string;
  status: Status;
  detail: string;
  duration_ms?: number;
}

const ETL_STALE_HOURS = 48;

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await work();
  return { value, ms: Math.round(performance.now() - started) };
}

async function checkDatabase(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<Check> {
  try {
    const { value, ms } = await timed(async () =>
      supabase.from('users').select('id', { count: 'exact', head: true }),
    );
    if (value.error) return { id: 'db', label: 'Database', status: 'fail', detail: value.error.message, duration_ms: ms };
    return {
      id: 'db',
      label: 'Database',
      status: ms > 1500 ? 'warn' : 'pass',
      detail: `Reachable; ${value.count ?? 0} accounts`,
      duration_ms: ms,
    };
  } catch (err) {
    return { id: 'db', label: 'Database', status: 'fail', detail: String(err) };
  }
}

async function checkWarehouse(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<Check> {
  const { value, ms } = await timed(async () => supabase.rpc('dw_analytics_summary'));
  if (value.error) {
    return { id: 'dw', label: 'Data warehouse', status: 'fail', detail: value.error.message, duration_ms: ms };
  }
  const lastRun = (value.data as { etl?: { last_run_at?: string | null } } | null)?.etl?.last_run_at ?? null;
  if (!lastRun) {
    return { id: 'dw', label: 'Data warehouse', status: 'warn', detail: 'Reachable, but the ETL has never run', duration_ms: ms };
  }
  const hours = (Date.now() - new Date(lastRun).getTime()) / 3_600_000;
  return {
    id: 'dw',
    label: 'Data warehouse',
    status: hours > ETL_STALE_HOURS ? 'warn' : 'pass',
    detail: `Last ETL ${hours < 1 ? 'under an hour' : `${Math.round(hours)} h`} ago`,
    duration_ms: ms,
  };
}

async function checkMl(): Promise<Check> {
  const url = process.env.ML_SERVICE_URL;
  if (!url) return { id: 'ml', label: 'ML service', status: 'fail', detail: 'ML_SERVICE_URL is not set' };
  const started = performance.now();
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const ms = Math.round(performance.now() - started);
    return res.ok
      ? { id: 'ml', label: 'ML service', status: ms > 5000 ? 'warn' : 'pass', detail: `Healthy (HTTP ${res.status})`, duration_ms: ms }
      : { id: 'ml', label: 'ML service', status: 'fail', detail: `HTTP ${res.status}`, duration_ms: ms };
  } catch {
    // A free Render instance sleeps and takes up to a minute to wake.
    return {
      id: 'ml',
      label: 'ML service',
      status: 'warn',
      detail: 'No answer within 10 s; it may be waking from sleep. Run again in a minute.',
      duration_ms: Math.round(performance.now() - started),
    };
  }
}

function checkConfig(): Check[] {
  const mail = getProvider();
  const ai = [process.env.GEMINI_API_KEY && 'Gemini', process.env.OPENROUTER_API_KEY && 'OpenRouter'].filter(Boolean);
  const secret = process.env.SESSION_SECRET ?? '';
  return [
    {
      id: 'email',
      label: 'Email delivery',
      status: mail ? 'pass' : 'fail',
      detail: mail ? `Configured (${mail === 'resend' ? 'Resend' : 'SMTP'})` : 'No mail provider configured',
    },
    {
      id: 'ai',
      label: 'AI providers',
      status: ai.length === 2 ? 'pass' : ai.length === 1 ? 'warn' : 'fail',
      detail: ai.length ? `Keys present: ${ai.join(', ')}${ai.length === 1 ? ' (no fallback)' : ''}` : 'No AI key set',
    },
    {
      id: 'session',
      label: 'Session signing',
      status: secret.length >= 32 ? 'pass' : secret.length >= 16 ? 'warn' : 'fail',
      detail: secret.length >= 32 ? 'Secret set' : secret.length >= 16 ? 'Secret shorter than 32 characters' : 'Secret missing',
    },
  ];
}

/** Runs every health check now and keeps the result. */
export async function POST() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();
  const checks = [
    ...(await Promise.all([checkDatabase(supabase), checkWarehouse(supabase), checkMl()])),
    ...checkConfig(),
  ];
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    total: checks.length,
  };
  const saved = await saveTestRun(supabase, { kind: 'health', runBy: guard.session.uid, summary, results: checks });
  return NextResponse.json({
    run: { id: saved.id, kind: 'health', created_at: new Date().toISOString(), summary, results: checks },
    saved: saved.saved,
  });
}
