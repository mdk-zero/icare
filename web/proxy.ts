import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/app/lib/auth/jwt';
import { isDeveloperEmail } from '@/app/lib/auth/developer-allowlist';
import { IMPERSONATION_RETURN_COOKIE } from '@/app/lib/dev/impersonation';

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
  '/admin',
  '/faculty',
  '/dashboard',
  '/notifications',
  '/patients',
  '/profile',
  '/quizzes',
  '/scenarios',
  '/change-password',
];

/** Signed-in users have no reason to see these, and bounce to their portal. */
const AUTH_PAGES = ['/login', '/signup'];

function homeFor(role: string): string {
  if (role === 'faculty') return '/faculty';
  if (role === 'admin') return '/admin';
  return '/dashboard';
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
  if (!isProtected && !isAuthPage) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (isProtected && !session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    const response = NextResponse.redirect(login);
    // The cookie is already invalid; clearing it stops the browser replaying
    // a dead token on every subsequent request.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  return NextResponse.next();
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
