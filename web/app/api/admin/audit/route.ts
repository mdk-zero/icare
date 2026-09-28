import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getAdminScope } from '@/app/lib/admin-scope';
import { deanActorFilter, readAuditTrail } from '@/app/lib/audit-trail';

/**
 * The dean's Activity Log: what this dean did and what their instructors did.
 * The trail across every role lives with the admin (/api/super-admin/audit).
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let scope;
  try {
    scope = await getAdminScope(getSupabaseAdmin(), session.uid);
  } catch {
    return NextResponse.json({ error: 'Unable to fetch audit logs' }, { status: 500 });
  }
  return readAuditTrail(request, deanActorFilter(session.uid, scope));
}
