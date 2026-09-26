/**
 * Client-side request telemetry (migration 054).
 *
 * Every API call that actually reaches the network is timed from send to
 * response headers — the response time a user waits on — and buffered here.
 * The buffer goes to /api/metrics every 15 seconds and once more when the
 * page is hidden, so a closing tab still reports. It is best-effort: a lost
 * batch costs a few samples, never a user-facing error.
 */

export interface RequestSample {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  at: number;
}

const ENDPOINT = '/api/metrics';
const FLUSH_MS = 15_000;
/** Beyond this the oldest samples are dropped rather than growing unbounded. */
const MAX_BUFFER = 200;
/** What one ingest request accepts. */
const MAX_BATCH = 100;

let buffer: RequestSample[] = [];
let timer: number | undefined;
let listening = false;

export function recordRequest(method: string, input: string, status: number, durationMs: number): void {
  if (typeof window === 'undefined') return;
  // Automated browsers (the Playwright suite) would pass for real traffic.
  if (navigator.webdriver) return;
  const path = input.split('?')[0];
  if (!path.startsWith('/api/') || path === ENDPOINT) return;
  buffer.push({ method, path, status, duration_ms: Math.round(durationMs), at: Date.now() });
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  schedule();
}

function schedule() {
  if (!listening) {
    listening = true;
    window.addEventListener('pagehide', () => flush(true));
  }
  if (timer === undefined) timer = window.setTimeout(() => flush(false), FLUSH_MS);
}

function flush(unloading: boolean) {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  while (buffer.length) {
    const batch = buffer.splice(0, MAX_BATCH);
    const body = JSON.stringify({ samples: batch });
    if (unloading && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) continue;
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}
