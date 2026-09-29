import { extractJson } from './openrouter';
import { providerFetch } from './record';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYSTEM_PROMPT =
  'Respond with a single valid JSON object and nothing else: no prose, no markdown code fences.';

export async function callAnthropic(prompt: string, attempt = 1): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

  const res = await providerFetch('anthropic', model, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // Retry transient overload (529/503/500) up to 3 times with backoff. A 429
    // means our rate limit or spend cap is hit, so fall back immediately.
    if ((res.status === 529 || res.status === 503 || res.status === 500) && attempt < 3) {
      const delay = attempt * 1000;
      console.warn(`Anthropic returned ${res.status}, retrying in ${delay}ms (attempt ${attempt})`);
      await sleep(delay);
      return callAnthropic(prompt, attempt + 1);
    }
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };

  if (json.stop_reason === 'max_tokens') {
    throw new Error('Anthropic response was cut off at max_tokens');
  }

  const text = json.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new Error('Anthropic returned an empty response');
  }

  const jsonText = extractJson(text);
  try {
    if (!jsonText) throw new Error('no JSON object');
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    if (attempt < 2) {
      // Retry once if the model produced malformed JSON.
      return callAnthropic(prompt, attempt + 1);
    }
    throw new Error('Failed to parse Anthropic response as JSON after retry');
  }
}
