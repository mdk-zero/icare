/**
 * Tells the per-instance caches when this instance writes to a table they
 * were read from, so they drop what they kept at once rather than at the end
 * of their TTL. The server's Supabase client sends every request through
 * watchedFetch (lib/supabase/server), so a new write anywhere is covered
 * without a call of its own.
 *
 * Only this instance hears it. Another instance, a different serverless
 * function, or the ML service writing directly still reaches a cache only
 * when its TTL runs out, which is what each cache's TTL is chosen for.
 */
type Listener = (table: string, body: string | null) => void;

const listeners = new Map<string, Listener[]>();

/** Calls `listener` after each successful insert, update, upsert or delete on one of `tables`. */
export function onTableWrite(tables: readonly string[], listener: Listener): void {
  for (const table of tables) listeners.set(table, [...(listeners.get(table) ?? []), listener]);
}

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** The table a PostgREST URL names; null for an RPC or anything else. */
function tableOf(url: string): string | null {
  const match = /\/rest\/v1\/([^/?#]+)/.exec(url);
  return match && match[1] !== 'rpc' ? decodeURIComponent(match[1]) : null;
}

export const watchedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!WRITES.has(method) || !response.ok) return response;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const table = tableOf(url);
  const heard = table ? listeners.get(table) : undefined;
  if (table && heard) {
    const body = typeof init?.body === 'string' ? init.body : null;
    for (const listener of heard) {
      try {
        listener(table, body);
      } catch (err) {
        console.error('A table-write listener failed', err);
      }
    }
  }
  return response;
};
