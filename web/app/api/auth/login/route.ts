import { NextResponse } from 'next/server';
import { findUserByEmail, sectionNameOf, toPublicUser, touchLastLogin } from '@/app/lib/auth/user';
import { verifyPassword } from '@/app/lib/auth/password';
import { openSession } from '@/app/lib/auth/session';
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

  const { email, password, client, remember } = body as {
    email?: unknown;
    password?: unknown;
    client?: unknown;
    remember?: unknown;
  };
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
  }
  // The web form says so; the mobile app sends neither field and keeps its
  // own "Remember me" on the device.
  const platform = client === 'web' ? 'web' : 'mobile';

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

    const publicUser = toPublicUser(row);
    const [, section, token] = await Promise.all([
      touchLastLogin(row.id),
      sectionNameOf(row.id),
      openSession(
        { uid: publicUser.id, role: publicUser.role, email: publicUser.email },
        { platform, remember: platform === 'mobile' || remember === true },
      ),
    ]);
    return NextResponse.json({ user: { ...publicUser, section }, sessionToken: token });
  } catch (err) {
    console.error('Login handler failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
