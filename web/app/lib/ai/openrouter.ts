function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text: string): string | null {
  // Some models wrap JSON in markdown code fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  // Try to find the first JSON object.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function parseRetryAfterSeconds(errorText: string): number | undefined {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { metadata?: { retry_after_seconds?: number } };
    };
    const seconds = parsed.error?.metadata?.retry_after_seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  } catch {
    // fall through
  }
  return undefined;
}

const DEFAULT_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-26b-a4b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];

const MAX_RATE_LIMIT_WAIT_MS = 12_000;
const MAX_RETRIES_PER_MODEL = 2;

export async function callOpenRouter(
  prompt: string,
  options: {
    models?: string[];
    modelIndex?: number;
    modelRetry?: number;
    errors?: string[];
  } = {},
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const models = options.models && options.models.length > 0
    ? options.models
    : DEFAULT_FREE_MODELS;

  const modelIndex = options.modelIndex ?? 0;
  const modelRetry = options.modelRetry ?? 0;
  const errors = options.errors ?? [];

  if (modelIndex >= models.length) {
    throw new Error(errors.join('; '));
  }

  const model = models[modelIndex];

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3000',
        'X-Title': 'iCARE++ Scenario Generator',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const text = await res.text();

      // If the provider rate-limited us and gave a Retry-After hint, wait and
      // retry the same model a limited number of times before falling back.
      if (res.status === 429 && modelRetry < MAX_RETRIES_PER_MODEL) {
        const retryAfterSeconds = parseRetryAfterSeconds(text);
        if (retryAfterSeconds !== undefined) {
          const delay = Math.min(
            retryAfterSeconds * 1000 + 500,
            MAX_RATE_LIMIT_WAIT_MS,
          );
          console.warn(
            `OpenRouter model ${model} rate-limited (retry ${modelRetry + 1}/${MAX_RETRIES_PER_MODEL}), waiting ${delay}ms`,
          );
          await sleep(delay);
          return callOpenRouter(prompt, {
            ...options,
            modelIndex,
            modelRetry: modelRetry + 1,
            errors,
          });
        }
      }

      throw new Error(`OpenRouter API error (${res.status}): ${text}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (json.error?.message) {
      throw new Error(`OpenRouter API error: ${json.error.message}`);
    }

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty response');
    }

    const jsonText = extractJson(content);
    if (!jsonText) {
      throw new Error('OpenRouter response did not contain valid JSON');
    }

    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(`${model}: ${message}`);

    if (modelIndex + 1 < models.length) {
      console.warn(`OpenRouter model ${model} failed, trying next model...`);
      await sleep(500);
      return callOpenRouter(prompt, {
        ...options,
        modelIndex: modelIndex + 1,
        modelRetry: 0,
        errors,
      });
    }

    throw new Error(errors.join('; '));
  }
}
