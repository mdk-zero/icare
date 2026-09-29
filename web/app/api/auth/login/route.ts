import { NextResponse, after } from 'next/server';
import { recordShiftActivity } from '@/app/lib/shift-presence';
import { findUserByEmail, toPublicUser, touchLastLogin } from '@/app/lib/auth/user';
import { verifyPassword } from '@/app/lib/auth/password';
import { setSessionCookie, signSession } from '@/app/lib/auth/session';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';

// Password guessing: a cap per address (one attacker) and per account (a
// botnet aimed at one inbox). Both count every attempt, right or wrong.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 10;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const allowed =
    (await consumeRateLimit(`login:ip:${clientIp(request)}`, MAX_PER_IP, WINDOW_MS)) &&
    (await consumeRateLimit(`login:email:${normalizedEmail}`, MAX_PER_EMAIL, WINDOW_MS));
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
      { status: 429 },
    );
  }

  try {
    const row = await findUserByEmail(normalizedEmail);
    if (!row || !row.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await touchLastLogin(row.id);
    const publicUser = toPublicUser(row);
    const token = await signSession({ uid: publicUser.id, role: publicUser.role, email: publicUser.email });
    await setSessionCookie(token);
    if (publicUser.role === 'student') {
      // Signing in during a shift checks the student in.
      after(() => recordShiftActivity(publicUser.id, new Date(), { force: true }).catch((err) => console.error('Shift presence failed', err)));
    }
    return NextResponse.json({ user: publicUser, sessionToken: token });
  } catch (err) {
    console.error('Login handler failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
