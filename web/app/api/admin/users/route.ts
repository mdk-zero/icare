import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { logAudit } from '@/app/lib/audit';

const VALID_ROLES = ['student', 'faculty', 'admin'] as const;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = request.nextUrl.searchParams.get('role');

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('users')
      .select('id, email, name, role, picture_url, created_at, last_login_at')
      .order('created_at', { ascending: false });
    if (role && (VALID_ROLES as readonly string[]).includes(role)) {
      query = query.eq('role', role);
    }
    const { data: users, error } = await query;
    if (error) {
      console.error('Failed to list users', error);
      return NextResponse.json({ error: 'Unable to list users' }, { status: 500 });
    }
    return NextResponse.json({ users: users ?? [] });
  } catch (err) {
    console.error('List users failed', err);
    return NextResponse.json({ error: 'Unable to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, role, section_id } = body as {
    name?: unknown;
    email?: unknown;
    role?: unknown;
    section_id?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (typeof role !== 'string' || !(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Role must be student, faculty, or admin' }, { status: 400 });
  }
  if (section_id !== undefined && section_id !== null && typeof section_id !== 'string') {
    return NextResponse.json({ error: 'Invalid section_id' }, { status: 400 });
  }

  const sectionId = typeof section_id === 'string' && section_id.trim() ? section_id.trim() : null;
  // Students are enrolled into a section; a section on a faculty/admin row would
  // silently scope them as if they were a student.
  if (sectionId && role !== 'student') {
    return NextResponse.json({ error: 'Only students can be placed in a section' }, { status: 400 });
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 },
      );
    }

    if (sectionId) {
      const { data: section } = await supabase
        .from('sections')
        .select('id')
        .eq('id', sectionId)
        .maybeSingle();
      if (!section) {
        return NextResponse.json({ error: 'Section not found' }, { status: 400 });
      }
    }

    const tempPassword = generateRandomPassword();
    const passwordHash = await hashPassword(tempPassword);

    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        name: trimmedName,
        role,
        password_hash: passwordHash,
        force_password_change: true,
        picture_url: null,
        section_id: sectionId,
      })
      .select('id, email, name, role, picture_url, created_at, last_login_at, section_id, sections(name)')
      .single();

    if (insertError || !user) {
      console.error('Failed to create user', insertError);
      return NextResponse.json({ error: 'Unable to create user' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'user.create', entityType: 'users', entityId: user.id, details: { role } },
      request,
    );

    // The invitation template is student-worded; for faculty/admin accounts the
    // Dean hands over the temporary password shown in the response instead.
    let warning: string | undefined;
    if (role === 'student') {
      const origin = request.headers.get('origin') ?? 'http://localhost:3000';
      const emailResult = await sendStudentInvitationEmail(
        normalizedEmail,
        trimmedName,
        `${origin}/login`,
        tempPassword,
      );
      if (!emailResult.success) {
        warning =
          'User created but the invitation email could not be sent. Share the temporary password below manually.';
      }
    }

    return NextResponse.json({ user, password: tempPassword, warning }, { status: 201 });
  } catch (err) {
    console.error('Create user failed', err);
    return NextResponse.json({ error: 'Unable to create user' }, { status: 500 });
  }
}
