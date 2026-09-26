import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { SESSION_COOKIE, signSession, verifySession } from '@/app/lib/auth/session';
import { logAudit } from '@/app/lib/audit';
import { DevError } from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';
import {
  encodeFlag,
  homeForRole,
  IMPERSONATION_FLAG_COOKIE,
  IMPERSONATION_RETURN_COOKIE,
} from '@/app/lib/dev/impersonation';

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

/**
 * Become another user.
 *
 * The session cookie is replaced with a token signed for the target and the
 * developer's own token is parked in a second cookie, so returning is a swap
 * rather than a re-login. The parked token is minted fresh rather than copied
 * from the request, so returning still works if the original was about to
 * expire or arrived as a bearer header instead of a cookie.
 */
export async function POST(request: NextRequest) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const store = await cookies();
    if (store.get(IMPERSONATION_RETURN_COOKIE)?.value) {
      throw new DevError('Already impersonating — return to yourself first');
    }

    const body = await request
      .json()
      .catch(() => {
        throw new DevError('Invalid JSON body');
      });
    if (typeof body.user_id !== 'string' || !body.user_id) {
      throw new DevError('user_id is required');
    }
    if (body.user_id === session.uid) {
      throw new DevError('That is already you');
    }

    const supabase = getSupabaseAdmin();
    const { data: target, error } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', body.user_id)
      .maybeSingle();
    if (error) throw new DevError(error.message, 400);
    if (!target) throw new DevError('User not found', 404);
    if (target.role === 'student') {
      throw new DevError('Students use the mobile app; there is no student web portal to sign in to');
    }

    await logAudit(
      session,
      {
        action: 'dev.impersonate.start',
        entityType: 'users',
        entityId: target.id,
        details: { email: target.email, role: target.role },
      },
      request,
    );

    const [targetToken, returnToken] = await Promise.all([
      signSession({ uid: target.id, role: target.role, email: target.email }),
      signSession({ uid: session.uid, role: session.role, email: session.email }),
    ]);

    const response = NextResponse.json({
      user: { id: target.id, email: target.email, name: target.name, role: target.role },
      home: homeForRole(target.role),
    });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: targetToken,
      maxAge: SEVEN_DAYS_SECONDS,
      ...cookieOptions(),
    });
    response.cookies.set({
      name: IMPERSONATION_RETURN_COOKIE,
      value: returnToken,
      maxAge: SEVEN_DAYS_SECONDS,
      ...cookieOptions(),
    });
    response.cookies.set({
      name: IMPERSONATION_FLAG_COOKIE,
      value: encodeFlag({
        name: target.name,
        email: target.email,
        role: target.role,
        by: session.email,
      }),
      maxAge: SEVEN_DAYS_SECONDS,
      ...cookieOptions(),
      // The banner is client-rendered on every page; it reads this directly
      // rather than blocking first paint on a fetch. No secret lives here.
      httpOnly: false,
    });
    return response;
  } catch (err) {
    return devErrorResponse(err);
  }
}

/**
 * Return to yourself.
 *
 * Gated on the parked token, not on the developer allowlist — while
 * impersonating, the live session belongs to the target and would fail that
 * check, which would strand the developer inside the other account.
 */
export async function DELETE(request: NextRequest) {
  try {
    const store = await cookies();
    const returnToken = store.get(IMPERSONATION_RETURN_COOKIE)?.value;
    if (!returnToken) return devNotFound();

    const original = await verifySession(returnToken);
    if (!original) {
      // The parked token expired. Clear everything and send them to login
      // rather than leaving a dead cookie that keeps offering a way back.
      const response = NextResponse.json(
        { error: 'Your original session expired — sign in again' },
        { status: 401 },
      );
      response.cookies.set({ name: SESSION_COOKIE, value: '', maxAge: 0, ...cookieOptions() });
      response.cookies.set({
        name: IMPERSONATION_RETURN_COOKIE, value: '', maxAge: 0, ...cookieOptions(),
      });
      response.cookies.set({
        name: IMPERSONATION_FLAG_COOKIE, value: '', maxAge: 0, ...cookieOptions(), httpOnly: false,
      });
      return response;
    }

    await logAudit(original, { action: 'dev.impersonate.stop' }, request);

    const response = NextResponse.json({ user: original, home: '/developer' });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: returnToken,
      maxAge: SEVEN_DAYS_SECONDS,
      ...cookieOptions(),
    });
    response.cookies.set({
      name: IMPERSONATION_RETURN_COOKIE, value: '', maxAge: 0, ...cookieOptions(),
    });
    response.cookies.set({
      name: IMPERSONATION_FLAG_COOKIE, value: '', maxAge: 0, ...cookieOptions(), httpOnly: false,
    });
    return response;
  } catch (err) {
    return devErrorResponse(err);
  }
}
