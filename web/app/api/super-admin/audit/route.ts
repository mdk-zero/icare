import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { readAuditTrail } from '@/app/lib/audit-trail';

/** The whole system's audit trail, every actor and role. */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  return readAuditTrail(request, null);
}
