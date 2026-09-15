"use client";

/**
 * One process-wide cache for read requests, so a page the user has already
 * opened renders from memory instead of re-hitting the API.
 *
 * Two layers sit here because they answer two different questions:
 *
 *  - The **response cache** removes the network round-trip. It is keyed by URL
 *    and shared by every caller of `apiFetch`, whether that is an `app/lib/api`
 *    helper or a page calling an endpoint directly.
 *  - The **page store** removes the skeleton. It holds each page's assembled
 *    data under a key the page chooses, and `use-page-data` reads it
 *    synchronously during the first render, so a revisit never flips back to a
 *    loading state. Loading is driven from here rather than from React so that
 *    two components on the same key share one request.
 *
 * Both live in module scope, which means they die with the document: a full
 * page load, a logout redirect, or a session-expiry redirect all start clean.
 */

// ---------------------------------------------------------------------------
// Shared invalidation
// ---------------------------------------------------------------------------

/**
 * Bumped by every cache clear. A read that was already in flight when a write
 * landed carries the old generation, so it is never allowed to pass itself off
 * as current data.
 */
let generation = 0;

/**
 * Set while a caller is deliberately refreshing. It has to be ambient rather
 * than an argument because the `app/lib/api` helpers own their own `apiFetch`
 * calls and take no options.
 *
 * Concurrent requests from an unrelated page can be swept up while the flag is
 * raised. That only costs an extra request — it can never serve wrong data —
 * and the window is one loader's lifetime.
 */
let forceDepth = 0;

/** Runs `fn` with the response cache bypassed, then re-fills it with the result. */
export async function withFreshResponses<T>(fn: () => Promise<T>): Promise<T> {
  forceDepth += 1;
  try {
    return await fn();
  } finally {
    forceDepth -= 1;
  }
}

/**
 * Drops every cached read.
 *
 * Called after any successful write and on every auth transition. Clearing
 * wholesale rather than guessing which endpoints a write touched is the only
 * rule that cannot go stale: creating a student moves the faculty roster, the
 * admin roster, the section counts and the dashboard totals at once, and a
 * prefix rule would miss most of them.
 *
 * Page snapshots are marked stale rather than dropped, so a page that is on
 * screen when a write lands keeps its rows and refreshes underneath them
 * instead of blinking back to a skeleton.
 */
export function clearRequestCache() {
  generation += 1;
  responses.clear();
  inflight.clear();
  for (const [key, entry] of pages) {
    pages.set(key, { ...entry, settledAt: 0 });
    notify(key);
  }
  for (const listener of clearListeners) listener();
}

const clearListeners = new Set<() => void>();

/**
 * Runs after every clear. Server-rendered segments are held by the router's own
 * cache, which knows nothing about these, so something has to tell it that a
 * write happened — see the `Shell`.
 */
export function onCacheClear(listener: () => void): () => void {
  clearListeners.add(listener);
  return () => clearListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Response cache
// ---------------------------------------------------------------------------

interface CachedResponse {
  body: string;
  status: number;
  contentType: string | null;
  storedAt: number;
}

/** How long a cached response may still be served. Older entries are refetched. */
const RESPONSE_TTL_MS = 5 * 60 * 1000;

const responses = new Map<string, CachedResponse>();
const inflight = new Map<string, Promise<CachedResponse>>();

/**
 * Authentication is exempt: `/api/auth/session` is the liveness check that
 * decides whether the session is still good, so a cached copy would keep a dead
 * session looking alive.
 */
function isCacheable(url: string, init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;
  if (init?.cache === "no-store" || init?.cache === "reload") return false;
  if (!url.startsWith("/api/")) return false;
  if (url.startsWith("/api/auth/")) return false;
  return true;
}

function toResponse(entry: CachedResponse): Response {
  return new Response(entry.body, {
    status: entry.status,
    headers: entry.contentType ? { "content-type": entry.contentType } : undefined,
  });
}

/** Carries a non-cacheable response back out of the shared in-flight promise. */
class PassThrough extends Error {
  constructor(readonly response: Response) {
    super("uncacheable response");
  }
}

/**
 * A GET whose body we can replay. Anything else — a mutation, a non-200, a
 * network error — is handed back untouched and leaves the cache alone.
 */
export async function cachedFetch(
  input: string,
  init: RequestInit | undefined,
  send: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  if (!isCacheable(input, init)) return send(input, init);

  if (forceDepth === 0) {
    const hit = responses.get(input);
    if (hit && Date.now() - hit.storedAt < RESPONSE_TTL_MS) return toResponse(hit);

    // Two components mounting at once ask for the same endpoint; they share the
    // one request rather than racing each other.
    const pending = inflight.get(input);
    if (pending) return toResponse(await pending);
  }

  const request = (async () => {
    const startedAt = generation;
    const res = await send(input, init);
    // Only a plain 200 with a body is replayable; 204 in particular cannot be
    // reconstructed, because `new Response(body, { status: 204 })` throws.
    if (res.status !== 200) throw new PassThrough(res);
    const entry: CachedResponse = {
      body: await res.text(),
      status: res.status,
      contentType: res.headers.get("content-type"),
      storedAt: Date.now(),
    };
    if (startedAt === generation) responses.set(input, entry);
    return entry;
  })();

  inflight.set(input, request);

  try {
    return toResponse(await request);
  } catch (err) {
    if (err instanceof PassThrough) return err.response;
    throw err;
  } finally {
    inflight.delete(input);
  }
}

// ---------------------------------------------------------------------------
// Page store
// ---------------------------------------------------------------------------

export interface PageEntry {
  data?: unknown;
  error?: unknown;
  /** When the last attempt settled. Zero marks the entry stale on purpose. */
  settledAt: number;
  /** True while a refresh runs behind data that is already on screen. */
  revalidating: boolean;
}

const pages = new Map<string, PageEntry>();
const loads = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  const subscribers = listeners.get(key);
  if (!subscribers) return;
  for (const listener of subscribers) listener();
}

function commit(key: string, entry: PageEntry) {
  pages.set(key, entry);
  notify(key);
}

/**
 * `useSyncExternalStore` needs a stable reference for an unchanged entry, so
 * this hands back the stored object itself and every write replaces it whole.
 */
export function readPage(key: string): PageEntry | undefined {
  return pages.get(key);
}

export function subscribePage(key: string, listener: () => void): () => void {
  let subscribers = listeners.get(key);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(key, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

/** Replaces a page's data directly, for an optimistic edit after a mutation. */
export function writePage<T>(key: string, data: T) {
  commit(key, { data, settledAt: Date.now(), revalidating: false });
}

async function runLoad(key: string, loader: () => Promise<unknown>, background: boolean) {
  const previous = pages.get(key);
  if (background && previous) commit(key, { ...previous, revalidating: true });

  const startedAt = generation;
  try {
    const data = await (background ? withFreshResponses(loader) : loader());
    // A write that landed mid-flight makes this result a snapshot of the past.
    // It is still the best thing to show, so it is committed — but marked stale,
    // so the next render refreshes it rather than trusting it.
    commit(key, { data, settledAt: startedAt === generation ? Date.now() : 0, revalidating: false });
  } catch (error) {
    console.error(`page data "${key}" failed to load`, error);
    // Recorded with a settle time so a permanently failing loader backs off to
    // the freshness interval instead of retrying on every render.
    commit(key, { ...previous, error, settledAt: Date.now(), revalidating: false });
  } finally {
    loads.delete(key);
  }
}

/**
 * Loads `key` if nothing usable is held for it. Idempotent and safe to call on
 * every render: a fresh entry or an in-flight load both return immediately.
 */
export function ensureLoaded(key: string, loader: () => Promise<unknown>, freshFor: number) {
  if (loads.has(key)) return;
  const entry = pages.get(key);
  if (entry && Date.now() - entry.settledAt < freshFor) return;
  loads.set(key, runLoad(key, loader, entry !== undefined));
}

/** Refetches past both caches, regardless of how fresh the current entry is. */
export function reloadPage(key: string, loader: () => Promise<unknown>): Promise<void> {
  const existing = loads.get(key);
  if (existing) return existing;
  const load = runLoad(key, loader, pages.has(key));
  loads.set(key, load);
  return load;
}
