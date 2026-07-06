import { NextResponse } from 'next/server';
import { getSupabaseAdmin, type UserRole } from '@/app/lib/supabase/server';
import { hashPassword } from '@/app/lib/auth/password';
import { setSessionCookie, signSession } from '@/app/lib/auth/session';
import { checkRateLimit } from '@/app/lib/auth/rate-limit';
import { toPublicUser } from '@/app/lib/auth/user';

const MIN_PASSWORD_LENGTH = 8;
const MAX_REQUESTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, password, role } = body as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  };

  const validRoles: UserRole[] = ['faculty', 'admin'];

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    name.trim().length === 0 ||
    email.trim().length === 0 ||
    password.length === 0 ||
    !validRoles.includes(role as UserRole)
  ) {
    return NextResponse.json(
      { error: 'Name, email, password, and a valid role are required' },
      { status: 400 },
    );
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Rate limit by email.
  const limit = checkRateLimit(`register:${normalizedEmail}`, MAX_REQUESTS, WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check for existing user.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const selectedRole = role as UserRole;

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        name: trimmedName,
        role: selectedRole,
        password_hash: passwordHash,
      })
      .select('id, email, name, role, picture_url, password_hash, force_password_change')
      .single();

    if (error) {
      console.error('Insert user failed', error);
      return NextResponse.json({ error: 'Unable to create account' }, { status: 500 });
    }

    const publicUser = toPublicUser(user);
    const token = await signSession({
      uid: publicUser.id,
      role: publicUser.role,
      email: publicUser.email,
    });
    await setSessionCookie(token);

    return NextResponse.json(
      { user: publicUser, sessionToken: token },
      { status: 201 },
    );
  } catch (err) {
    console.error('Registration failed', err);
    return NextResponse.json(
      { error: 'Unable to create account. Please try again later.' },
      { status: 500 },
    );
  }
}
