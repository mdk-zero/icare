import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '../supabase/server';

/**
 * Session primitives with no `next/headers` dependency, so middleware — which
 * runs before the cookies()/headers() APIs are available — can verify a token
 * from the same code the route handlers use. Cookie reading and writing lives
 * in ./session, which re-exports everything here.
 */

export const SESSION_COOKIE = 'icare_session';

export interface SessionPayload {
  uid: string;
  role: UserRole;
  email: string;
  /** When the token was issued, in seconds (the standard claim). */
  iat?: number;
  /**
   * When the token was issued, in milliseconds. It is compared with
   * users.sessions_valid_after; whole seconds can't separate a token revoked
   * by a cutoff from one issued just after it.
   */
  iatMs?: number;
}

export function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short. Generate with `openssl rand -base64 32`');
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  // Only the identity claims: callers pass a read session back in, and its
  // old iat must not ride along.
  const { uid, role, email } = payload;
  return await new SignJWT({ uid, role, email, iat_ms: Date.now() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    if (
      typeof payload.uid === 'string' &&
      typeof payload.role === 'string' &&
      typeof payload.email === 'string'
    ) {
      return {
        uid: payload.uid,
        role: payload.role as UserRole,
        email: payload.email,
        iat: typeof payload.iat === 'number' ? payload.iat : undefined,
        iatMs: typeof payload.iat_ms === 'number' ? payload.iat_ms : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
