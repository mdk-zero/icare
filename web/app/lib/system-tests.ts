import type { getSupabaseAdmin } from './supabase/server';
import { isMissingMigration } from './auth/super-admin';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export type TestRunKind = 'benchmark' | 'dw_benchmark' | 'health' | 'e2e' | 'api';

/**
 * Saves one run to system_test_runs (migration 054). Returns false, not an
 * error, when the table isn't there yet: the result still goes back to the
 * page, it just isn't kept.
 */
export async function saveTestRun(
  supabase: Supabase,
  run: { kind: TestRunKind; runBy: string; summary: unknown; results: unknown },
): Promise<{ id: string | null; saved: boolean }> {
  const { data, error } = await supabase
    .from('system_test_runs')
    .insert({ kind: run.kind, run_by: run.runBy, summary: run.summary, results: run.results })
    .select('id')
    .single();
  if (error) {
    if (!isMissingMigration(error)) console.error('Failed to save test run', error);
    return { id: null, saved: false };
  }
  return { id: data.id as string, saved: true };
}

/** One Playwright test or Postman request in a suite run. */
export interface SuiteCase {
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error: string | null;
}

/**
 * running: the reporter is still sending results. done: it finished.
 * interrupted: it was stopped (Ctrl+C) before the end. A running run that
 * stops updating is shown as interrupted by the page.
 */
export type SuiteStatus = 'running' | 'done' | 'interrupted';
export const SUITE_STATUSES: SuiteStatus[] = ['running', 'done', 'interrupted'];

const CASE_STATUSES = ['passed', 'failed', 'skipped'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

/** Checks a reported results array; null when it isn't one. */
export function parseSuiteCases(raw: unknown, { allowEmpty = false } = {}): SuiteCase[] | null {
  if (!Array.isArray(raw) || raw.length > 1000 || (raw.length === 0 && !allowEmpty)) return null;
  const results: SuiteCase[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const status = r.status as SuiteCase['status'];
    const duration = Number(r.duration_ms);
    const name = str(r.name, 300);
    if (!name || !CASE_STATUSES.includes(status) || !Number.isFinite(duration) || duration < 0) return null;
    results.push({
      suite: str(r.suite, 200) ?? '',
      name,
      status,
      duration_ms: Math.round(duration),
      error: str(r.error, 2000),
    });
  }
  return results;
}

/**
 * The summary kept beside a suite run's results. `previous` carries over what
 * was set when a live run started (runner, commit, planned count).
 */
export function suiteSummary(
  results: SuiteCase[],
  meta: Record<string, unknown>,
  status: SuiteStatus,
  previous: Record<string, unknown> = {},
) {
  const count = (s: string) => results.filter((r) => r.status === s).length;
  const planned = Number(meta.planned ?? previous.planned);
  return {
    total: results.length,
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
    duration_ms: Math.round(Number(meta.duration_ms) || results.reduce((sum, r) => sum + r.duration_ms, 0)),
    base_url: str(meta.base_url, 200) ?? str(previous.base_url, 200),
    runner: str(meta.runner, 80) ?? str(previous.runner, 80),
    commit: str(meta.commit, 40) ?? str(previous.commit, 40),
    // How many tests the run will have, so the page can show progress.
    planned: Number.isInteger(planned) && planned > 0 && planned <= 1000 ? planned : null,
    status,
    updated_at: new Date().toISOString(),
  };
}
