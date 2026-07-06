import { NextResponse } from 'next/server';
import { findUserByEmail, toPublicUser, touchLastLogin } from '@/app/lib/auth/user';
import { verifyPassword } from '@/app/lib/auth/password';
import { setSessionCookie, signSession } from '@/app/lib/auth/session';

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

  try {
    const row = await findUserByEmail(email.trim().toLowerCase());
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
    return NextResponse.json({ user: publicUser, sessionToken: token });
  } catch (err) {
    console.error('Login handler failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
