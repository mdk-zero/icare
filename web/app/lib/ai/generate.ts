import { callOpenRouter } from './openrouter';
import { providerFetch } from './record';
import { headers } from 'next/headers';
import { readSession } from '../auth/session';
import { consumeRateLimit } from '../auth/rate-limit';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt: string, attempt = 1): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await providerFetch('gemini', model, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // Daily quota errors won't resolve by retrying, so fall back immediately.
    const isDailyQuota =
      text.includes('QuotaFailure') || text.includes('GenerateRequestsPerDay');
    // Retry on transient overload (503) or short-term rate limit (429) up to 3 times with backoff.
    if ((res.status === 503 || (res.status === 429 && !isDailyQuota)) && attempt < 3) {
      const delay = attempt * 1000;
      console.warn(`Gemini returned ${res.status}, retrying in ${delay}ms (attempt ${attempt})`);
      await sleep(delay);
      return callGemini(prompt, attempt + 1);
    }
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: { text?: string }[];
      };
      finishReason?: string;
    }[];
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(`Gemini API error: ${json.error.message}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (attempt < 2) {
      // Retry once if the model produced malformed or truncated JSON.
      return callGemini(prompt, attempt + 1);
    }
    throw new Error('Failed to parse Gemini response as JSON after retry');
  }
}

const AI_PER_USER_PER_HOUR = 20;
const AI_GLOBAL_PER_DAY = 200;

/** Thrown by callAI when the app's own AI budget is spent; see enforceAiBudget. */
export class AiRateLimitedError extends Error {}

/**
 * The providers' free tiers are one small daily quota (~20 requests per model)
 * shared by every user, so one person tapping "generate" in a loop would spend
 * it for everyone. Every AI call counts against the signed-in user's hourly
 * budget and a global daily one. Outside a request (seed scripts) there is no
 * session, and only the global budget applies.
 */
async function enforceAiBudget(): Promise<void> {
  let inRequest = true;
  try {
    await headers();
  } catch {
    inRequest = false; // A script, not a route.
  }
  // Inside a request, a failed session lookup must fail the call rather than
  // quietly skip the per-user budget.
  const userId = inRequest ? ((await readSession())?.uid ?? null) : null;
  const allowed =
    (!userId || (await consumeRateLimit(`ai:user:${userId}`, AI_PER_USER_PER_HOUR, 60 * 60 * 1000))) &&
    (await consumeRateLimit('ai:global', AI_GLOBAL_PER_DAY, 24 * 60 * 60 * 1000));
  if (!allowed) throw new AiRateLimitedError('AI is busy right now. Please try again later.');
}

/** Gemini first (JSON mode), falling back to the OpenRouter free-model chain. */
export async function callAI(prompt: string): Promise<Record<string, unknown>> {
  await enforceAiBudget();
  try {
    return await callGemini(prompt);
  } catch (geminiErr) {
    console.warn('Gemini failed, falling back to OpenRouter', geminiErr instanceof Error ? geminiErr.message : geminiErr);
    try {
      return await callOpenRouter(prompt);
    } catch (openrouterErr) {
      const messages = [
        geminiErr instanceof Error ? geminiErr.message : 'Gemini failed',
        openrouterErr instanceof Error ? openrouterErr.message : 'OpenRouter failed',
      ];
      throw new Error(messages.join('; '));
    }
  }
}

/** Maps a raw AI-failure message to the HTTP response the faculty UI expects. */
export function aiErrorResponse(err: unknown, entity: string): { error: string; status: number } {
  if (err instanceof AiRateLimitedError) return { error: err.message, status: 429 };
  const rawMessage = err instanceof Error ? err.message : `Unable to generate ${entity}`;
  const lower = rawMessage.toLowerCase();
  const isRateLimit =
    rawMessage.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota exceeded') ||
    lower.includes('resource_exhausted');

  if (isRateLimit) {
    return {
      error: 'AI providers are currently rate-limited. Please try again in a moment.',
      status: 429,
    };
  }
  return {
    error: `Unable to generate ${entity}. The AI service may be unavailable.`,
    status: 500,
  };
}
