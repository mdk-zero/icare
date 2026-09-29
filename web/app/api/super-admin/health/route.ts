import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { getProvider } from '@/app/lib/auth/email';
import { saveTestRun } from '@/app/lib/system-tests';
import { anthropicModel } from '@/app/lib/ai/anthropic';
import { geminiModel } from '@/app/lib/ai/generate';
import { DEFAULT_FREE_MODELS } from '@/app/lib/ai/openrouter';

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

/**
 * One check per AI provider, in the order callAI tries them. Each asks the
 * provider's model-lookup endpoint, which proves the key and model are good
 * without generating anything, so a run spends no quota and is not logged as
 * AI traffic. A missing key is a warning: callAI skips that provider.
 */
async function checkAiProvider(
  id: string,
  label: string,
  key: string | undefined,
  keyName: string,
  lookup: (key: string) => Promise<{ res: Response; ok: (res: Response) => Promise<Omit<Check, 'id' | 'label'>> }>,
): Promise<Check> {
  if (!key) return { id, label, status: 'warn', detail: `${keyName} is not set; this provider is skipped` };
  const started = performance.now();
  try {
    const { res, ok } = await lookup(key);
    const duration_ms = Math.round(performance.now() - started);
    if (res.ok) return { id, label, ...(await ok(res)), duration_ms };
    const detail =
      res.status === 401 || res.status === 403
        ? `Key rejected (HTTP ${res.status})`
        : res.status === 404
          ? `Model not found (HTTP 404)`
          : `HTTP ${res.status}`;
    return { id, label, status: 'fail', detail, duration_ms };
  } catch {
    return { id, label, status: 'warn', detail: 'No answer within 10 s', duration_ms: Math.round(performance.now() - started) };
  }
}

function checkAi(): Promise<Check[]> {
  const opts = { signal: AbortSignal.timeout(10_000), cache: 'no-store' as const };
  return Promise.all([
    checkAiProvider('ai_claude', 'AI: Claude (primary)', process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY', async (key) => {
      const model = anthropicModel();
      const res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
        ...opts,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
      return { res, ok: async () => ({ status: 'pass', detail: `Key valid; ${model} available` }) };
    }),
    checkAiProvider('ai_gemini', 'AI: Gemini (fallback)', process.env.GEMINI_API_KEY, 'GEMINI_API_KEY', async (key) => {
      const model = geminiModel();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${key}`,
        opts,
      );
      return {
        res,
        ok: async () => ({ status: 'pass', detail: `Key valid; ${model} available (free tier ~20 requests/day)` }),
      };
    }),
    checkAiProvider('ai_openrouter', 'AI: OpenRouter (last fallback)', process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY', async (key) => {
      // /key validates the key; the public model list shows which free models are still offered.
      const res = await fetch('https://openrouter.ai/api/v1/key', { ...opts, headers: { Authorization: `Bearer ${key}` } });
      return {
        res,
        ok: async () => {
          const list = await fetch('https://openrouter.ai/api/v1/models', opts)
            .then((r) => (r.ok ? (r.json() as Promise<{ data?: { id: string }[] }>) : null))
            .catch(() => null);
          if (!list?.data) return { status: 'warn', detail: 'Key valid; could not load the model list' };
          const offered = new Set(list.data.map((m) => m.id));
          const live = DEFAULT_FREE_MODELS.filter((m) => offered.has(m));
          const gone = DEFAULT_FREE_MODELS.filter((m) => !offered.has(m));
          return {
            status: live.length === 0 ? 'fail' : gone.length ? 'warn' : 'pass',
            detail: `Key valid; ${live.length} of ${DEFAULT_FREE_MODELS.length} free models still offered${gone.length ? ` (gone: ${gone.join(', ')})` : ''}`,
          };
        },
      };
    }),
  ]);
}

function checkConfig(): Check[] {
  const mail = getProvider();
  const secret = process.env.SESSION_SECRET ?? '';
  return [
    {
      id: 'email',
      label: 'Email delivery',
      status: mail ? 'pass' : 'fail',
      detail: mail ? `Configured (${mail === 'resend' ? 'Resend' : 'SMTP'})` : 'No mail provider configured',
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
    ...(await checkAi()),
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
