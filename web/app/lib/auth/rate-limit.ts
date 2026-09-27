import { getSupabaseAdmin } from '../supabase/server';
import { isMissingMigration } from './super-admin';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Sweep expired entries every 5 minutes so the map doesn't grow unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Useful for tests or if you ever want to reset a key manually.
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * A rate limit shared by every server instance (migration 059's
 * consume_rate_limit), so a client spread across instances on Vercel still
 * hits the limit. True if this request is allowed; it is counted either way.
 *
 * Before 059 is applied this falls back to the per-instance Map above. Any
 * other database error fails open — a Supabase hiccup must not lock every
 * user out of signing in.
 */
export async function consumeRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
    p_key: key,
    p_max: maxRequests,
    p_window_seconds: Math.ceil(windowMs / 1000),
  });
  if (error) {
    if (isMissingMigration(error)) return checkRateLimit(key, maxRequests, windowMs).allowed;
    console.error('Rate limit check failed; allowing the request', key, error);
    return true;
  }
  return data === true;
}

/**
 * The caller's IP. Vercel sets x-real-ip and overwrites x-forwarded-for, so
 * a client cannot choose its own bucket; elsewhere (local dev) both may be
 * absent and everyone shares 'unknown'.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
