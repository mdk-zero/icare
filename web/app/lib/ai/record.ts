import { getSupabaseAdmin } from '../supabase/server';

export type AiProvider = 'gemini' | 'openrouter';

/**
 * fetch() to an AI provider that also logs the call to request_metrics as
 * source = 'ai' (migration 060), so the super admin dashboard can show how
 * much traffic spends the providers' quota. Every attempt counts, retries and
 * fallbacks included, since each one uses quota. Logging never fails the
 * call: before 060 the insert is rejected and the row is simply dropped.
 */
export async function providerFetch(
  provider: AiProvider,
  model: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(url, init);
    status = res.status;
    return res;
  } finally {
    await record(provider, model, status, Date.now() - started);
  }
}

async function record(provider: AiProvider, model: string, status: number, durationMs: number): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('request_metrics')
      .insert({
        method: 'POST',
        route: `${provider}/${model}`.slice(0, 200),
        status,
        duration_ms: Math.min(Math.round(durationMs), 300_000),
        source: 'ai',
      });
  } catch {
    // Telemetry only.
  }
}
