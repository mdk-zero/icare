import { NextResponse, type NextRequest } from 'next/server';
import { findUserByEmail, sectionNameOf, toPublicUser, touchLastLogin } from '@/app/lib/auth/user';
import { verifyPassword } from '@/app/lib/auth/password';
import { openSession } from '@/app/lib/auth/session';
import { clientIp, consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { logStudentWebEvent, studentWebEnabled } from '@/app/lib/student-web-server';
import { STUDENT_WEB_OFF_MESSAGE, STUDENT_WEB_SIGNIN, STUDENT_WEB_STAFF_MESSAGE } from '@/app/lib/student-web';

// Password guessing: a cap per address (one attacker) and per account (a
// botnet aimed at one inbox). Both count every attempt, right or wrong.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 10;

export async function POST(request: NextRequest) {
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
  // own "Remember me" on the device. The student web app (lib/student-web)
  // takes the web slot, which students have no other use for.
  const studentWeb = client === 'student-web';
  const platform = client === 'web' || studentWeb ? 'web' : 'mobile';
  try {
    if (studentWeb && !(await studentWebEnabled())) {
      return NextResponse.json({ error: STUDENT_WEB_OFF_MESSAGE, code: 'student_web_off' }, { status: 403 });
    }
  } catch (err) {
    console.error('Login: reading the student web switch failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
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

    const publicUser = toPublicUser(row);
    if (studentWeb && publicUser.role !== 'student') {
      return NextResponse.json({ error: STUDENT_WEB_STAFF_MESSAGE, code: 'student_web_staff' }, { status: 403 });
    }
    // The portal has nothing for students and signs them straight out again.
    // Opening a session would only take the web slot from the student web
    // app (lib/student-web) and sign them out there.
    if (client === 'web' && publicUser.role === 'student') {
      return NextResponse.json({ user: { ...publicUser, section: null }, sessionToken: null });
    }
    const identity = { uid: publicUser.id, role: publicUser.role, email: publicUser.email };
    const [, section, token] = await Promise.all([
      touchLastLogin(row.id),
      sectionNameOf(row.id),
      openSession(identity, {
        platform,
        remember: platform === 'mobile' || remember === true,
        client: studentWeb ? 'student-web' : undefined,
      }),
    ]);
    // Who is signed in on the web decides who gets notifications by email.
    if (studentWeb) await logStudentWebEvent(identity, STUDENT_WEB_SIGNIN, request);
    return NextResponse.json({ user: { ...publicUser, section }, sessionToken: token });
  } catch (err) {
    console.error('Login handler failed', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
