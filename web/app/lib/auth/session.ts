import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { getSupabaseAdmin } from '../supabase/server';
import { isMissingColumn, liveSession } from './live-user';
import { SESSION_COOKIE, getSecret, signSession, verifySession } from './jwt';
import type { SessionPayload } from './jwt';

// Signing and verification live in ./jwt so middleware can share them without
// pulling in next/headers. Re-exported here so existing importers are unaffected.
export { SESSION_COOKIE, signSession, verifySession } from './jwt';
export type { SessionPayload } from './jwt';

export const GOOGLE_ONBOARDING_COOKIE = 'icare_google_onboarding';
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
// Long enough to fill in the contact form after picking a Google account.
const ONBOARDING_TTL_SECONDS = 60 * 30;

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** The signed-in user, checked against their live row (see liveSession). */
export async function readSession(): Promise<SessionPayload | null> {
  const claims = await readTokenClaims();
  return claims ? await liveSession(claims) : null;
}

/**
 * Updates a user row and, when `revoke` is set, signs out every existing
 * session of theirs in the same statement: tokens issued before now stop
 * working at their next request. One write, so a password or role change and
 * its revocation land together or not at all. Call reissueSession() after it
 * to keep the caller's own device signed in.
 *
 * Before migration 059 there is no cutoff column; the update is retried
 * without it, and nothing is revoked.
 */
export async function updateUser(
  userId: string,
  fields: Record<string, unknown>,
  { revoke, columns = 'id' }: { revoke: boolean; columns?: string },
) {
  const supabase = getSupabaseAdmin();
  const run = async (f: Record<string, unknown>) => {
    const { data, error } = await supabase.from('users').update(f).eq('id', userId).select(columns).maybeSingle();
    return { data: data as Record<string, unknown> | null, error };
  };
  if (!revoke) return run(fields);
  const result = await run({ ...fields, sessions_valid_after: new Date().toISOString() });
  if (!result.error || !isMissingColumn(result.error)) return result;
  console.warn('users.sessions_valid_after is missing (apply migration 059); sessions not revoked');
  return run(fields);
}

/**
 * A fresh token for this user after updateUser(..., { revoke: true }), set as the web
 * cookie. Returned only to bearer-token (mobile) callers, which must store it
 * in place of their old one; a cookie client has no use for it in page script.
 */
export async function reissueSession(session: SessionPayload): Promise<string | undefined> {
  const token = await signSession(session);
  await setSessionCookie(token);
  const authorization = (await headers()).get('authorization');
  return authorization?.startsWith('Bearer ') ? token : undefined;
}

/** The token's claims, signature-checked but not looked up. */
async function readTokenClaims(): Promise<SessionPayload | null> {
  // Mobile clients (Expo app) send the JWT the login route returns as
  // `sessionToken`, in an Authorization bearer header. It wins over a cookie:
  // React Native keeps cookies in a native store, which can still hold one
  // from an earlier sign-in after the app has swapped in a fresh token.
  const headerStore = await headers();
  const authorization = headerStore.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return verifySession(authorization.slice('Bearer '.length));
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export interface GoogleOnboardingPayload {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function signGoogleOnboarding(
  payload: GoogleOnboardingPayload,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(getSecret());
}

export async function verifyGoogleOnboarding(
  token: string,
): Promise<GoogleOnboardingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.name === 'string' &&
      (payload.picture === undefined || payload.picture === null ||
        typeof payload.picture === 'string')
    ) {
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: typeof payload.picture === 'string' ? payload.picture : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setGoogleOnboardingCookie(
  token: string,
): Promise<void> {
  const store = await cookies();
  store.set({
    name: GOOGLE_ONBOARDING_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONBOARDING_TTL_SECONDS,
  });
}

export async function clearGoogleOnboardingCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: GOOGLE_ONBOARDING_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function readGoogleOnboarding(): Promise<GoogleOnboardingPayload | null> {
  const store = await cookies();
  const token = store.get(GOOGLE_ONBOARDING_COOKIE)?.value;
  if (!token) return null;
  return verifyGoogleOnboarding(token);
}
