/** US dollars per million tokens. `free` marks a model the app pays nothing for. */
export interface AiRate {
  input: number;
  output: number;
  free?: boolean;
}

/**
 * Anthropic's list prices (checked 2026-10-17), for the System Dashboard's
 * cost estimate. Providers don't send a price with their answers, so update
 * this when a price changes or ANTHROPIC_MODEL names a model not listed.
 * Prompt caching isn't used, so every input token is priced at the base rate.
 */
const CLAUDE: Record<string, AiRate> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

const FREE: AiRate = { input: 0, output: 0, free: true };

/**
 * The rate for a request_metrics AI route ("<provider>/<model>"), or null
 * when the model's price isn't known. The Gemini key is on the free tier
 * (its ~20 requests a day per model are the limit, not a bill), and the
 * OpenRouter fallbacks are its ":free" models.
 */
export function aiRate(route: string): AiRate | null {
  const slash = route.indexOf('/');
  const provider = route.slice(0, slash);
  const model = route.slice(slash + 1);
  if (provider === 'anthropic') return CLAUDE[model.replace(/-\d{8}$/, '')] ?? null;
  if (provider === 'gemini') return FREE;
  if (provider === 'openrouter' && model.endsWith(':free')) return FREE;
  return null;
}

/** Estimated cost in US dollars, or null when the rate isn't known. */
export function aiCost(route: string, inputTokens: number, outputTokens: number): number | null {
  const rate = aiRate(route);
  return rate ? (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000 : null;
}
