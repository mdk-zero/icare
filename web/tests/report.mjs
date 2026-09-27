/**
 * Sends a Playwright or Postman run to /super-admin/tests while it runs, so
 * the page shows each test as it finishes, next to the health checks and
 * benchmarks.
 *
 * It signs in as the super admin account from tests/env.mjs, opens a live run
 * with POST /api/super-admin/test-runs, sends the results so far about once a
 * second with PATCH /api/super-admin/test-runs/[id], and marks the run done at
 * the end. TEST_REPORT_URL can point at a different deployment from the one
 * tested (default: the tested one).
 */
import { execSync } from 'node:child_process';
import { accounts, baseUrl } from './env.mjs';

/** @typedef {{ suite: string, name: string, status: 'passed'|'failed'|'skipped', duration_ms: number, error?: string | null }} Row */

const UPDATE_EVERY_MS = 1000;

/**
 * Opens a live run. Never throws: when reporting isn't possible it warns once
 * and the returned handle does nothing, so the tests themselves still run.
 *
 * @param {'e2e' | 'api'} kind
 * @param {{ runner: string, planned?: number }} meta planned = how many tests will run
 * @returns {Promise<{ update(results: Row[]): void, finish(results: Row[], meta: { duration_ms: number, interrupted?: boolean }): Promise<void> }>}
 */
export async function startLiveRun(kind, meta) {
  const noop = { update() {}, async finish() {} };
  const target = (process.env.TEST_REPORT_URL || baseUrl).replace(/\/$/, '');
  const account = accounts.super_admin;
  if (!account) {
    console.warn('[report] TEST_SUPER_ADMIN_EMAIL/PASSWORD not set; results not sent.');
    return noop;
  }

  let commit = null;
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Not a git checkout; the run is still worth keeping.
  }

  const started = Date.now();
  let headers;
  let id;
  try {
    const login = await fetch(`${target}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const { sessionToken } = await login.json();
    if (!login.ok || !sessionToken) throw new Error(`sign-in failed (HTTP ${login.status})`);
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` };

    const res = await fetch(`${target}/api/super-admin/test-runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind, live: true, results: [], meta: { ...meta, base_url: baseUrl, commit } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    if (!json.saved || !json.run?.id) {
      console.warn('[report] Not sent: migration 054 is not applied on that database.');
      return noop;
    }
    id = json.run.id;
    console.log(`[report] Live at ${target}/super-admin/tests`);
  } catch (err) {
    console.warn(`[report] Could not send results: ${err.message}`);
    return noop;
  }

  /** @type {Row[] | null} */
  let pending = null;
  let timer = null;
  let chain = Promise.resolve();
  let failed = false;

  // Sends are chained so they reach the server in order; each carries every result so far.
  const send = (results, status, duration_ms) => {
    chain = chain.then(async () => {
      try {
        const res = await fetch(`${target}/api/super-admin/test-runs/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status, results, meta: { duration_ms } }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        if (!failed) console.warn(`[report] Could not send results: ${err.message}`);
        failed = true;
      }
    });
    return chain;
  };

  return {
    update(results) {
      pending = results;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const rows = pending;
        pending = null;
        send(rows, 'running', Date.now() - started);
      }, UPDATE_EVERY_MS);
    },
    async finish(results, { duration_ms, interrupted = false }) {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      await send(results, interrupted ? 'interrupted' : 'done', duration_ms);
      if (!failed) console.log(`[report] Saved to ${target}/super-admin/tests`);
    },
  };
}
