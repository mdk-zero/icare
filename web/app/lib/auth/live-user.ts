import { getSupabaseAdmin, type UserRole } from '../supabase/server';
import type { SessionPayload } from './jwt';

/**
 * A session token checked against the user's live row. Shared by readSession()
 * (API routes, server pages) and the proxy (page navigations), so both agree
 * on who is signed in. No next/headers here: the proxy imports this.
 *
 * The JWT alone is good for 7 days. Trusting its claims would let a deleted
 * account keep working, and a demoted one keep its old role, until it
 * expired. So: no row means no session, the role and email are the live ones,
 * and a token issued before users.sessions_valid_after (migration 059,
 * bumped on a password or role change) is refused.
 *
 * A database error throws. A 500 is recoverable, while a null makes clients
 * sign the user out.
 */
export async function liveSession(claims: SessionPayload): Promise<SessionPayload | null> {
  const live = await loadLiveUser(claims.uid);
  if (!live) return null;
  if (live.validAfterMs !== null && issuedAtMs(claims) < live.validAfterMs) return null;
  return { ...claims, role: live.role, email: live.email };
}

/**
 * Tokens signed since 059 carry iat_ms. Older ones only have iat (whole
 * seconds), so they are read at the start of their second. Those were all
 * issued before any cutoff existed, and erring early only ever refuses them.
 */
function issuedAtMs(claims: SessionPayload): number {
  if (claims.iatMs !== undefined) return claims.iatMs;
  return claims.iat !== undefined ? claims.iat * 1000 : 0;
}

interface LiveUser {
  role: UserRole;
  email: string;
  validAfterMs: number | null;
}

/**
 * Before 059 the cutoff column is missing (42703) and the row is read again
 * without it. That costs a round trip, but it is not cached: an instance
 * that went on skipping the column after the migration landed would disagree
 * with its neighbours about a revoked session.
 */
async function loadLiveUser(uid: string): Promise<LiveUser | null> {
  const supabase = getSupabaseAdmin();
  const withCutoff = await supabase
    .from('users')
    .select('role, email, sessions_valid_after')
    .eq('id', uid)
    .maybeSingle();
  if (!withCutoff.error) {
    const data = withCutoff.data;
    if (!data) return null;
    return {
      role: data.role as UserRole,
      email: data.email as string,
      validAfterMs: data.sessions_valid_after ? new Date(data.sessions_valid_after as string).getTime() : null,
    };
  }
  if (withCutoff.error.code !== '42703') throw withCutoff.error;

  const { data, error } = await supabase.from('users').select('role, email').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { role: data.role as UserRole, email: data.email as string, validAfterMs: null };
}

/** PostgREST's code for an unknown column: 42703 when reading, PGRST204 when writing. */
export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}
