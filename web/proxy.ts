import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/app/lib/auth/jwt';

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

export const config = {
  // Everything except API routes, Next internals, and static files — those
  // either do their own auth or need to stay reachable while signed out.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
