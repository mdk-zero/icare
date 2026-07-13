import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import type { UserRole } from '../supabase/server';

export const SESSION_COOKIE = 'icare_session';
export const GOOGLE_ONBOARDING_COOKIE = 'icare_google_onboarding';
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
const TEN_MINUTES_SECONDS = 60 * 10;

export interface SessionPayload {
  uid: string;
  role: UserRole;
  email: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short. Generate with `openssl rand -base64 32`');
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
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
      };
    }
    return null;
  } catch {
    return null;
  }
}

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

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) return verifySession(token);

  // Mobile clients (Expo app) send the same JWT the login route returns
  // as `sessionToken`, in an Authorization bearer header instead of a cookie.
  const headerStore = await headers();
  const authorization = headerStore.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return verifySession(authorization.slice('Bearer '.length));
  }
  return null;
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
    .setExpirationTime('10m')
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
    maxAge: TEN_MINUTES_SECONDS,
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
