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

export type MlAction = 'predict' | 'recommend';

const ACTION_PATH: Record<MlAction, string> = {
  predict: '/predict/at-risk',
  recommend: '/recommend/refresh',
};

/** Scoring a cohort is slow; the admin UI runs both jobs back to back. */
const RUN_TIMEOUT_MS = 120_000;

export interface MlRunOutcome {
  ok: boolean;
  status: number;
  result?: Record<string, unknown>;
  error?: string;
}

export function isMlAction(value: unknown): value is MlAction {
  return value === 'predict' || value === 'recommend';
}

/**
 * Run one job. `studentIds` scopes it; omit for the whole cohort.
 *
 * Never pass an empty array. The service filters with `if student_ids:`
 * (app/features.py), and an empty list is falsy in Python, so `[]` reads as
 * "no filter" and quietly scores everyone. Callers that derive the list from a
 * roster must handle the empty case themselves rather than relying on this.
 */
export async function callMlService(
  action: MlAction,
  studentIds?: string[],
): Promise<MlRunOutcome> {
  const serviceUrl = process.env.ML_SERVICE_URL;
  const serviceSecret = process.env.ML_SERVICE_SECRET;
  if (!serviceUrl || !serviceSecret) {
    return {
      ok: false,
      status: 503,
      error: 'ML service is not configured (ML_SERVICE_URL / ML_SERVICE_SECRET)',
    };
  }

  if (studentIds && studentIds.length === 0) {
    // Guarding here as well as at the call site: sending this on would be a
    // silent privilege escalation, not an empty run.
    return { ok: false, status: 400, error: 'No students to run against' };
  }

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}${ACTION_PATH[action]}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ICARE-ML-KEY': serviceSecret,
      },
      body: JSON.stringify(studentIds ? { student_ids: studentIds } : {}),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });

    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      console.error('ML service run failed', response.status, result);
      return {
        ok: false,
        status: 502,
        error: typeof result?.detail === 'string' ? result.detail : 'ML service run failed',
      };
    }
    return { ok: true, status: 200, result };
  } catch (err) {
    console.error('ML service unreachable', err);
    return { ok: false, status: 502, error: 'ML service unreachable' };
  }
}
