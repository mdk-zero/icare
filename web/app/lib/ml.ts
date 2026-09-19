/**
 * Proxy to the ml/ FastAPI service.
 *
 * The service is never exposed to browsers — it holds the Supabase service
 * role key and authenticates callers with a shared secret, so every run goes
 * through a Next.js route that has already established who is asking and what
 * they are allowed to touch.
 *
 * Shared by the admin route (whole cohort) and the faculty route (their own
 * sections) so the two cannot drift on timeout, headers, or error shape.
 */

import { NextResponse } from 'next/server';
import { NDJSON, readNdjson } from './ndjson';

export type MlAction = 'predict' | 'recommend';

const ACTION_PATH: Record<MlAction, string> = {
  predict: '/predict/at-risk',
  recommend: '/recommend/refresh',
};

/** Scoring a cohort is slow; the admin UI runs both jobs back to back. */
const RUN_TIMEOUT_MS = 120_000;

/**
 * One line of a run as the browser reads it: steps done while the job works,
 * then exactly one result or error to finish.
 */
export type MlEvent =
  | { done: number; total: number }
  | { result: Record<string, unknown> }
  | { error: string };

export function isMlAction(value: unknown): value is MlAction {
  return value === 'predict' || value === 'recommend';
}

function isMlEvent(value: unknown): value is MlEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    (typeof event.done === 'number' && typeof event.total === 'number') ||
    (typeof event.result === 'object' && event.result !== null) ||
    typeof event.error === 'string'
  );
}

/**
 * Run one job and relay its progress. `studentIds` scopes it; omit for the
 * whole cohort.
 *
 * Never pass an empty array. The service filters with `if student_ids:`
 * (app/features.py), and an empty list is falsy in Python, so `[]` reads as
 * "no filter" and quietly scores everyone. Callers that derive the list from a
 * roster must handle the empty case themselves rather than relying on this.
 *
 * A run that fails to start — missing config, an unreachable service, a
 * non-2xx — is a JSON error with a status, like any other route. Once the
 * service has accepted it, the response is an NDJSON stream of MlEvents.
 * `onResult` runs before the result line goes out, so a run the browser saw
 * finish has already been audited.
 */
export async function streamMlRun(
  action: MlAction,
  studentIds: string[] | undefined,
  onResult: (result: Record<string, unknown>) => Promise<void>,
): Promise<Response> {
  const serviceUrl = process.env.ML_SERVICE_URL;
  const serviceSecret = process.env.ML_SERVICE_SECRET;
  if (!serviceUrl || !serviceSecret) {
    return NextResponse.json(
      { error: 'ML service is not configured (ML_SERVICE_URL / ML_SERVICE_SECRET)' },
      { status: 503 },
    );
  }

  if (studentIds && studentIds.length === 0) {
    // Guarding here as well as at the call site: sending this on would be a
    // silent privilege escalation, not an empty run.
    return NextResponse.json({ error: 'No students to run against' }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${serviceUrl.replace(/\/$/, '')}${ACTION_PATH[action]}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: NDJSON,
        'X-ICARE-ML-KEY': serviceSecret,
      },
      body: JSON.stringify(studentIds ? { student_ids: studentIds } : {}),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('ML service unreachable', err);
    return NextResponse.json({ error: 'ML service unreachable' }, { status: 502 });
  }

  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    console.error('ML service run failed', response.status, result);
    return NextResponse.json(
      { error: typeof result?.detail === 'string' ? result.detail : 'ML service run failed' },
      { status: 502 },
    );
  }

  const events = serviceEvents(response, onResult);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      },
      async cancel() {
        await events.return(undefined);
      },
    }),
    { headers: { 'Content-Type': NDJSON, 'Cache-Control': 'no-store' } },
  );
}

/**
 * The service's events, checked, and always ending in a result or an error. A
 * service deployed before progress streaming ignores the Accept header and
 * answers in plain JSON, which arrives here as a lone result.
 */
async function* serviceEvents(
  response: Response,
  onResult: (result: Record<string, unknown>) => Promise<void>,
): AsyncGenerator<MlEvent> {
  try {
    if (!response.body || !response.headers.get('content-type')?.includes(NDJSON)) {
      const result = (await response.json()) as Record<string, unknown>;
      await onResult(result);
      yield { result };
      return;
    }
    for await (const event of readNdjson(response.body)) {
      if (!isMlEvent(event)) continue;
      if ('result' in event) await onResult(event.result);
      yield event;
      if (!('done' in event)) return;
    }
    console.error('ML service stream ended without a result');
  } catch (err) {
    console.error('ML service stream failed', err);
  }
  yield { error: 'ML service run failed' };
}
