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
