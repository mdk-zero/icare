import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { readAuditTrail } from '@/app/lib/audit-trail';

/**
 * The admin's Activity Log: only what this admin did. The trail across every
 * role lives with the super admin (/api/super-admin/audit).
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return readAuditTrail(request, session.uid);
}
