import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { logAudit } from '@/app/lib/audit';
import { callMlService, isMlAction } from '@/app/lib/ml';

/**
 * On-demand ML runs across the whole cohort (Phase 3.5/3.8).
 *
 * The service also runs both jobs nightly on its own scheduler; this covers
 * demos and first-time population. Faculty get the same jobs scoped to their
 * own sections via /api/faculty/ml.
 *
 * Requires ML_SERVICE_URL and ML_SERVICE_SECRET in the web environment.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;
  if (!isMlAction(action)) {
    return NextResponse.json({ error: 'action must be "predict" or "recommend"' }, { status: 400 });
  }

  // No student_ids: the cohort-wide run is the point of this route.
  const outcome = await callMlService(action);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  await logAudit(
    session,
    {
      action: action === 'predict' ? 'ml.predict_run' : 'ml.recommend_run',
      entityType: 'ml_service',
      details: { ...outcome.result, scope: 'cohort' },
    },
    request,
  );

  return NextResponse.json({ result: outcome.result });
}
