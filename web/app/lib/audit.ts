import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase/server';
import { verifySession } from './auth/jwt';
import { IMPERSONATION_RETURN_COOKIE } from './dev/impersonation';
import type { SessionPayload } from './auth/session';

export interface AuditEntry {
  action: string;              // e.g. 'assessment.create', 'quiz.submit'
  entityType?: string;         // e.g. 'assessments'
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Append a row to the audit trail. Fire-and-forget: an audit failure is
 * logged to the server console but never fails the calling request.
 */
export async function logAudit(
  session: SessionPayload,
  entry: AuditEntry,
  request?: NextRequest,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const forwarded = request?.headers.get('x-forwarded-for');
    // An action taken while impersonating is the target's on paper. Naming the
    // developer behind it keeps the trail honest without splitting the actor.
    const impersonator = await impersonatorEmail(request);
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: session.uid,
      actor_role: session.role,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: impersonator
        ? { ...(entry.details ?? {}), impersonated_by: impersonator }
        : (entry.details ?? {}),
      ip_address: forwarded ? forwarded.split(',')[0].trim() : null,
      user_agent: request?.headers.get('user-agent') ?? null,
    });
    if (error) console.error('audit log insert failed', error);
  } catch (err) {
    console.error('audit log failed', err);
  }
}

/**
 * The developer behind an impersonated session, if this request carries the
 * parked return token. Read off the request rather than next/headers so the
 * audit path stays usable from anywhere a NextRequest is in hand.
 */
async function impersonatorEmail(request?: NextRequest): Promise<string | null> {
  const token = request?.cookies.get(IMPERSONATION_RETURN_COOKIE)?.value;
  if (!token) return null;
  const original = await verifySession(token);
  return original?.email ?? null;
}
