import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { parseSuiteCases, suiteSummary, SUITE_STATUSES, type SuiteStatus } from '@/app/lib/system-tests';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Updates a live Playwright/Postman run with every result so far (the whole
 * list each time, so a lost update is repaired by the next one), and finally
 * marks it done. A run that is no longer running can't be changed.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status as SuiteStatus;
  const results = parseSuiteCases(body?.results, { allowEmpty: true });
  if (!body || !results || !SUITE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid test results' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: run, error } = await supabase
    .from('system_test_runs')
    .select('kind, summary')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ saved: false });
    console.error('Failed to load test run', error);
    return NextResponse.json({ error: 'Unable to update test run' }, { status: 500 });
  }
  const previous = (run?.summary ?? {}) as Record<string, unknown>;
  if (!run || (run.kind !== 'e2e' && run.kind !== 'api')) {
    return NextResponse.json({ error: 'Test run not found' }, { status: 404 });
  }
  if (previous.status !== 'running') {
    return NextResponse.json({ error: 'This run has already finished' }, { status: 409 });
  }

  const summary = suiteSummary(results, (body.meta ?? {}) as Record<string, unknown>, status, previous);
  const { error: updateError } = await supabase
    .from('system_test_runs')
    .update({ summary, results })
    .eq('id', id);
  if (updateError) {
    console.error('Failed to update test run', updateError);
    return NextResponse.json({ error: 'Unable to update test run' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
