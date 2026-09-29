/**
 * Whether the web app can reach its server, for the connection toasts.
 *
 * The browser's online/offline events only notice a lost network interface.
 * They miss a Wi-Fi with no internet behind it, or the server being down, so
 * failed requests feed in too: a request that never got a response triggers
 * one probe of /api/health, and only a failed probe counts. While the server
 * is out of reach the probe repeats with backoff, and the first success
 * restores the state.
 *
 * Client-only and free of React, so api.ts can report into it.
 */

export type Connectivity = 'online' | 'offline' | 'unreachable';

const PROBE_TIMEOUT_MS = 5000;
const RETRY_START_MS = 3000;
const RETRY_MAX_MS = 30000;

let state: Connectivity = 'online';
const listeners = new Set<(next: Connectivity) => void>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_START_MS;
let probing = false;

function set(next: Connectivity) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener(next);
}

/** Subscribes to changes; returns the unsubscribe. */
export function onConnectivityChange(listener: (next: Connectivity) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectivity(): Connectivity {
  return state;
}

/** One reachability check, around api.ts so it is never cached or counted. */
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void probe();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

function stopRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = RETRY_START_MS;
}

/** Checks the server and settles the state on what it finds. */
async function probe(): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    if (!navigator.onLine) {
      set('offline');
      stopRetry(); // the 'online' event restarts it
      return;
    }
    if (await reachable()) {
      stopRetry();
      set('online');
    } else {
      set('unreachable');
      scheduleRetry();
    }
  } finally {
    probing = false;
  }
}

/** A request got no response at all (not an abort). */
export function reportNetworkFailure(): void {
  if (typeof window === 'undefined') return;
  void probe();
}

/** A request got a response, so the server is reachable. */
export function reportNetworkSuccess(): void {
  if (state === 'online') return;
  stopRetry();
  set('online');
}

let started = false;

/** Wires the browser events in once. Safe to call repeatedly. */
export function startConnectivityWatch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('offline', () => {
    stopRetry();
    set('offline');
  });
  // Back on a network is not the same as back on the server: check first.
  window.addEventListener('online', () => void probe());
  if (!navigator.onLine) set('offline');
}
