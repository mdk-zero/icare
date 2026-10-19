import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, endsWithTab, verifySession, type SessionPayload } from '@/app/lib/auth/jwt';
import { liveSessionStatus, type SessionEnd } from '@/app/lib/auth/live-user';
import { TAB_PRESENCE_COOKIE } from '@/app/lib/tab-presence';
import { isDeveloperEmail } from '@/app/lib/auth/developer-allowlist';
import {
  IMPERSONATION_FLAG_COOKIE,
  IMPERSONATION_RETURN_COOKIE,
} from '@/app/lib/dev/impersonation';
import { DEMO_COOKIE, isDemoRole } from '@/app/lib/demo/session';

/**
 * Server-side session gate.
 *
 * The page layouts gate on localStorage, which never expires on its own, so a
 * dead session used to render the full authenticated shell while every request
 * behind it returned 401. Checking the cookie here means an expired session
 * lands on /login instead of a broken dashboard.
 *
 * This is a routing guard, not the security boundary — the API routes each
 * call readSession() themselves, and that is what actually protects data.
 */
const PROTECTED_PREFIXES = [
  '/super-admin',
  '/admin',
  '/faculty',
  '/change-password',
];

/** Signed-in users have no reason to see these, and bounce to their portal. */
const AUTH_PAGES = ['/login', '/signup'];

function homeFor(role: string): string {
  if (role === 'faculty') return '/faculty';
  if (role === 'admin') return '/admin';
  if (role === 'super_admin') return '/super-admin';
  // Students use the mobile app; the web has no student portal. The login
  // page signs them out and says so.
  return STUDENT_LANDING;
}

const STUDENT_LANDING = '/login?reason=student';

/**
 * The super admin runs accounts and system health only: none of the
 * teaching portals apply to them, and nobody else belongs in theirs. The
 * pages' own gates re-check against the live user row.
 */
function wrongPortal(role: string, pathname: string): boolean {
  if (role === 'student') return true;
  const inSuperAdmin = pathname === '/super-admin' || pathname.startsWith('/super-admin/');
  if (role === 'super_admin') return !inSuperAdmin && pathname !== '/change-password';
  return inSuperAdmin;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /*
   * The developer console's API, screened before Next routes the method.
   *
   * Each /api/dev handler re-checks against the live user row and is what
   * actually protects the data; this only makes the routes disappear. Without
   * it, a GET to a POST-only handler answers 405 whoever is asking, which
   * tells a prober the endpoint is real. /developer itself is left to its
   * layout, which throws the app's own 404 page rather than a bare status.
   */
  if (pathname.startsWith('/api/dev/')) {
    const session = await developerFrom(request);
    if (!isDeveloperEmail(session?.email) && !(await canReturnFrom(request, pathname))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthPage = AUTH_PAGES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected && !isAuthPage) {
    // A session whose last tab has closed is over here too: /developer's
    // layout and other server-rendered pages read the cookie themselves. The
    // page is asked for again without it, so it renders signed out.
    if (!(await endedWithTab(request))) return NextResponse.next();
    return endTabSession(NextResponse.redirect(request.nextUrl));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { session: realSession, ended } = token
    ? await pageSession(token, request.cookies.has(TAB_PRESENCE_COOKIE))
    : { session: null, ended: undefined };
  // Said on the sign-in page, so a person signed out by a sign-in somewhere
  // else knows why, and knows to act if it wasn't them.
  const replaced = ended === 'replaced';
  // A demo has no session, only its role in a cookie. That routes page shells
  // and nothing more: the API routes never read it, and in a demo the browser
  // answers every API call itself (lib/demo).
  const demoRole = request.cookies.get(DEMO_COOKIE)?.value;
  const session: Pick<SessionPayload, 'role'> | null =
    realSession ?? (isDemoRole(demoRole) ? { role: demoRole } : null);

  if (isProtected && !session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    if (replaced) login.searchParams.set('reason', 'replaced');
    const response = NextResponse.redirect(login);
    // The cookie is already invalid; clearing it stops the browser replaying
    // a dead token on every subsequent request.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return ended === 'closed' ? endTabSession(response) : response;
  }

  // A student is sent to /login to be signed out there, not bounced away from it.
  if (isAuthPage && session && session.role !== 'student') {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  // A cookie that verifies but whose session was revoked (deleted account,
  // password or role change): drop it. Otherwise the page's first API call
  // gets a 401 and sends the user to /login, /login bounces them back here,
  // and the two loop forever.
  if (isAuthPage && token && !realSession) {
    const reasonMissing = pathname === '/login' && !request.nextUrl.searchParams.has('reason');
    let response = NextResponse.next();
    if (replaced && reasonMissing) {
      const login = request.nextUrl.clone();
      login.searchParams.set('reason', 'replaced');
      response = NextResponse.redirect(login);
    }
    response.cookies.delete(SESSION_COOKIE);
    return ended === 'closed' ? endTabSession(response) : response;
  }

  if (isProtected && session && wrongPortal(session.role, pathname)) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  return NextResponse.next();
}

/**
 * The session behind a page navigation, checked against the live user row
 * the same way readSession() checks it for the API, so a deleted, revoked or
 * replaced session counts as signed out. Routing still uses the token's role: the
 * portal layouts gate on the role the client stored at sign-in, and routing
 * on a different one would bounce the two off each other. A role change
 * revokes the token (059), so the next sign-in brings both up to date.
 * If the database can't be reached, fall back to the signature alone: this
 * is a routing guard, and the API routes still check for themselves.
 */
const PAGE_SESSION_TIMEOUT_MS = 2000;

async function pageSession(
  token: string,
  tabOpen: boolean,
): Promise<{ session: SessionPayload | null; ended?: SessionEnd | 'closed' }> {
  const verified = await verifySession(token);
  if (!verified) return { session: null };
  // A cookie is the web's; only a token from before 079 leaves that unsaid.
  const claims: SessionPayload = { ...verified, platform: verified.platform ?? 'web' };
  // The row first: a tab signed out by a newer sign-in drops its presence
  // cookie on the way to /login, and the reason it shows is "replaced", not
  // a closed tab.
  const live = await liveStatus(claims);
  if (live && !live.session) return { session: null, ended: live.ended };
  // Signed in without "Remember me": the session ended with its last tab,
  // whatever the browser kept of the cookie (lib/tab-presence).
  if (endsWithTab(claims) && !tabOpen) return { session: null, ended: 'closed' };
  return { session: claims };
}

/** The live check, or null when the database can't answer in time. */
async function liveStatus(claims: SessionPayload) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A hung lookup must not hold every page navigation hostage.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), PAGE_SESSION_TIMEOUT_MS);
    });
    return await Promise.race([liveSessionStatus(claims), timeout]);
  } catch (err) {
    console.error('Proxy live session check failed; using the token alone', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A session signed in without "Remember me" whose tabs have all closed. The
 * signature alone decides it, so pages that need no session pay no lookup.
 */
/**
 * Clears a session that ended with its tabs, with any impersonation riding on
 * it: the parked way back belongs to the same browser session.
 */
function endTabSession(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(IMPERSONATION_RETURN_COOKIE);
  response.cookies.delete(IMPERSONATION_FLAG_COOKIE);
  return response;
}

async function endedWithTab(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || request.cookies.has(TAB_PRESENCE_COOKIE)) return false;
  const claims = await verifySession(token);
  return claims !== null && endsWithTab(claims);
}

/**
 * The one /api/dev request an impersonated session must be allowed to make.
 *
 * While impersonating, the live session belongs to the target and fails the
 * allowlist check — so screening on that alone strands the developer inside
 * the other account with no way back. The handler re-verifies this token; all
 * this does is let the request through to it.
 */
async function canReturnFrom(request: NextRequest, pathname: string): Promise<boolean> {
  if (pathname !== '/api/dev/impersonate') return false;
  const parked = request.cookies.get(IMPERSONATION_RETURN_COOKIE)?.value;
  if (!parked) return false;
  return isDeveloperEmail((await verifySession(parked))?.email);
}

/** Cookie or bearer token, matching what readSession() accepts. */
async function developerFrom(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return verifySession(cookie);
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return verifySession(authorization.slice('Bearer '.length));
  }
  return null;
}

export const config = {
  // Everything except API routes, Next internals, and static files — those
  // either do their own auth or need to stay reachable while signed out.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)',
    // The one API prefix the proxy does screen — see the note above.
    '/api/dev/:path*',
  ],
};
