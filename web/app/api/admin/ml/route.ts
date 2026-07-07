import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { logAudit } from '@/app/lib/audit';

/**
 * On-demand ML runs (Phase 3.5/3.8): proxies to the FastAPI service with
 * the shared secret. The service also runs both jobs nightly on its own
 * scheduler; this covers demos and first-time population.
 *
 * Requires ML_SERVICE_URL and ML_SERVICE_SECRET in the web environment.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceUrl = process.env.ML_SERVICE_URL;
  const serviceSecret = process.env.ML_SERVICE_SECRET;
  if (!serviceUrl || !serviceSecret) {
    return NextResponse.json(
      { error: 'ML service is not configured (ML_SERVICE_URL / ML_SERVICE_SECRET)' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { action } = body as Record<string, unknown>;
  if (action !== 'predict' && action !== 'recommend') {
    return NextResponse.json({ error: 'action must be "predict" or "recommend"' }, { status: 400 });
  }

  const path = action === 'predict' ? '/predict/at-risk' : '/recommend/refresh';

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ICARE-ML-KEY': serviceSecret,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(120_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('ML service run failed', response.status, result);
      return NextResponse.json(
        { error: result?.detail ?? 'ML service run failed' },
        { status: 502 },
      );
    }

    await logAudit(
      session,
      {
        action: action === 'predict' ? 'ml.predict_run' : 'ml.recommend_run',
        entityType: 'ml_service',
        details: result,
      },
      request,
    );

    return NextResponse.json({ result });
  } catch (err) {
    console.error('ML service unreachable', err);
    return NextResponse.json({ error: 'ML service unreachable' }, { status: 502 });
  }
}
