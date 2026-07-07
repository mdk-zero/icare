import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase/server';
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
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: session.uid,
      actor_role: session.role,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip_address: forwarded ? forwarded.split(',')[0].trim() : null,
      user_agent: request?.headers.get('user-agent') ?? null,
    });
    if (error) console.error('audit log insert failed', error);
  } catch (err) {
    console.error('audit log failed', err);
  }
}
