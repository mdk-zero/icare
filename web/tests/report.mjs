/**
 * Sends a finished Playwright or Postman run to /super-admin/tests, where it
 * shows next to the health checks and benchmarks.
 *
 * It signs in as the super admin account from tests/env.mjs and posts to
 * /api/super-admin/test-runs. TEST_REPORT_URL can point at a different
 * deployment from the one tested (default: the tested one).
 */
import { execSync } from 'node:child_process';
import { accounts, baseUrl } from './env.mjs';

/**
 * @param {'e2e' | 'api'} kind
 * @param {{ suite: string, name: string, status: 'passed'|'failed'|'skipped', duration_ms: number, error?: string | null }[]} results
 * @param {{ duration_ms?: number, runner: string }} meta
 */
export async function reportRun(kind, results, meta) {
  const target = (process.env.TEST_REPORT_URL || baseUrl).replace(/\/$/, '');
  const account = accounts.super_admin;
  if (!account) {
    console.warn('[report] TEST_SUPER_ADMIN_EMAIL/PASSWORD not set; results not sent.');
    return;
  }
  if (results.length === 0) return;

  let commit = null;
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Not a git checkout; the run is still worth keeping.
  }

  try {
    const login = await fetch(`${target}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const { sessionToken } = await login.json();
    if (!login.ok || !sessionToken) throw new Error(`sign-in failed (HTTP ${login.status})`);

    const res = await fetch(`${target}/api/super-admin/test-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ kind, results, meta: { ...meta, base_url: baseUrl, commit } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    console.log(
      json.saved
        ? `[report] Saved to ${target}/super-admin/tests`
        : '[report] Accepted but not saved: migration 054 is not applied on that database.',
    );
  } catch (err) {
    console.warn(`[report] Could not send results: ${err.message}`);
  }
}
