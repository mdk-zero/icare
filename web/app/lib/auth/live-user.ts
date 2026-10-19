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
 * a token issued before users.sessions_valid_after (migration 059, bumped on
 * a password or role change) is refused, and so is one from before the
 * account's latest sign-in on the same platform (079).
 *
 * A database error throws. A 500 is recoverable, while a null makes clients
 * sign the user out.
 */
export async function liveSession(claims: SessionPayload): Promise<SessionPayload | null> {
  return (await liveSessionStatus(claims)).session;
}

/**
 * Why a session stopped: the account is gone, its sessions were revoked, or
 * it signed in again on the same platform and this session lost its slot.
 */
export type SessionEnd = 'gone' | 'revoked' | 'replaced';

export async function liveSessionStatus(
  claims: SessionPayload,
): Promise<{ session: SessionPayload; ended?: undefined } | { session: null; ended: SessionEnd }> {
  const live = await loadLiveUser(claims.uid);
  if (!live) return { session: null, ended: 'gone' };
  if (live.validAfterMs !== null && issuedAtMs(claims) < live.validAfterMs) {
    return { session: null, ended: 'revoked' };
  }
  // Newest sign-in wins. A token without an id predates 079, and it loses
  // too once the account has signed in on this platform since.
  const current = claims.platform === 'mobile' ? live.mobileSessionId : live.webSessionId;
  if (current !== null && claims.sessionId !== current) return { session: null, ended: 'replaced' };
  return { session: { ...claims, role: live.role, email: live.email } };
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
  webSessionId: string | null;
  mobileSessionId: string | null;
}

/**
 * Before 059 or 079 one of the optional columns is missing (42703), and the
 * row is read again with `*`, which returns whichever of them exist. That
 * costs a round trip, but it is not cached: an instance that went on
 * skipping a column after its migration landed would disagree with its
 * neighbours about a revoked session.
 */
async function loadLiveUser(uid: string): Promise<LiveUser | null> {
  const supabase = getSupabaseAdmin();
  const full = await supabase
    .from('users')
    .select('role, email, sessions_valid_after, web_session_id, mobile_session_id')
    .eq('id', uid)
    .maybeSingle();
  if (!full.error) return full.data ? toLiveUser(full.data) : null;
  if (full.error.code !== '42703') throw full.error;

  const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data ? toLiveUser(data) : null;
}

function toLiveUser(row: Record<string, unknown>): LiveUser {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  const validAfter = text(row.sessions_valid_after);
  return {
    role: row.role as UserRole,
    email: row.email as string,
    validAfterMs: validAfter ? new Date(validAfter).getTime() : null,
    webSessionId: text(row.web_session_id),
    mobileSessionId: text(row.mobile_session_id),
  };
}

/** PostgREST's code for an unknown column: 42703 when reading, PGRST204 when writing. */
export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}
