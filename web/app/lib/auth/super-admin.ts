import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../supabase/server';
import { readSession } from './session';
import type { SessionPayload } from './jwt';

/**
 * The super admin's authority on who is asking (migration 054).
 *
 * The session JWT carries the role it was signed with and stays valid for
 * seven days, so a demoted super admin would keep their token's role until
 * it expired. The live row decides; the token only names the candidate.
 */
export async function readSuperAdminSession(): Promise<SessionPayload | null> {
  const session = await readSession();
  if (!session || session.role !== 'super_admin') return null;

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('role')
    .eq('id', session.uid)
    .maybeSingle();
  if (error || !data || data.role !== 'super_admin') return null;
  return session;
}

/** For route handlers: the session, or the 401/403 response to return instead. */
export async function requireSuperAdmin(): Promise<
  { session: SessionPayload; response?: never } | { session?: never; response: NextResponse }
> {
  const signedIn = await readSession();
  if (!signedIn) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const session = await readSuperAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

/**
 * Whether a query failed because migration 054 hasn't been applied: an
 * undefined table/function (42P01/42883) or PostgREST's schema-cache misses.
 */
export function isMissingMigration(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '');
}
