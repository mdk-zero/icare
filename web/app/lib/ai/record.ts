import { getSupabaseAdmin } from '../supabase/server';

export type AiProvider = 'anthropic' | 'gemini' | 'openrouter';

interface TokenUsage {
  input: number;
  output: number;
}

/**
 * fetch() to an AI provider that also logs the call to request_metrics as
 * source = 'ai' (migration 060), so the super admin dashboard can show how
 * much traffic spends the providers' quota, and how many tokens it used
 * (076). Every attempt counts, retries and fallbacks included, since each
 * one uses quota. Logging never fails the call: before 060 the insert is
 * rejected and the row is simply dropped.
 */
export async function providerFetch(
  provider: AiProvider,
  model: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const started = Date.now();
  let status = 0;
  let durationMs: number | null = null;
  let usage: TokenUsage | null = null;
  try {
    const res = await fetch(url, init);
    status = res.status;
    durationMs = Date.now() - started;
    // Read a copy, so the caller still gets the whole body.
    if (res.ok) usage = await readUsage(provider, res.clone());
    return res;
  } finally {
    await record(provider, model, status, durationMs ?? Date.now() - started, usage);
  }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** The token counts each provider sends back with a successful answer. */
async function readUsage(provider: AiProvider, res: Response): Promise<TokenUsage | null> {
  try {
    const json = (await res.json()) as Record<string, Record<string, unknown> | undefined>;
    if (provider === 'anthropic') {
      const u = json.usage;
      if (!u) return null;
      return {
        input: count(u.input_tokens) + count(u.cache_creation_input_tokens) + count(u.cache_read_input_tokens),
        output: count(u.output_tokens),
      };
    }
    if (provider === 'gemini') {
      const u = json.usageMetadata;
      if (!u) return null;
      // Gemini bills its thinking as output.
      return { input: count(u.promptTokenCount), output: count(u.candidatesTokenCount) + count(u.thoughtsTokenCount) };
    }
    const u = json.usage;
    if (!u) return null;
    return { input: count(u.prompt_tokens), output: count(u.completion_tokens) };
  } catch {
    return null;
  }
}

async function record(
  provider: AiProvider,
  model: string,
  status: number,
  durationMs: number,
  usage: TokenUsage | null,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const row: Record<string, unknown> = {
      method: 'POST',
      route: `${provider}/${model}`.slice(0, 200),
      status,
      duration_ms: Math.min(Math.round(durationMs), 300_000),
      source: 'ai',
    };
    const { error } = await supabase
      .from('request_metrics')
      .insert(usage ? { ...row, input_tokens: usage.input, output_tokens: usage.output } : row);
    // Before 076 there are no token columns; still count the call.
    if (error?.code === 'PGRST204' && usage) await supabase.from('request_metrics').insert(row);
  } catch {
    // Telemetry only.
  }
}
