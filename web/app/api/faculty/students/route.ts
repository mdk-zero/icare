import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { readSession } from '@/app/lib/auth/session';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Admin can see all students; faculty only sees their own roster.
    let query = supabase
      .from('users')
      .select('id, email, name, role, picture_url')
      .eq('role', 'student')
      .order('name', { ascending: true });

    if (session.role === 'faculty') {
      const { data: rosterIds, error: rosterError } = await supabase
        .from('faculty_students')
        .select('student_id')
        .eq('faculty_id', session.uid);

      if (rosterError) {
        console.error('Failed to fetch faculty roster', rosterError);
        return NextResponse.json({ error: 'Unable to fetch students' }, { status: 500 });
      }

      const ids = rosterIds?.map((r) => r.student_id) ?? [];
      if (ids.length === 0) {
        return NextResponse.json({ students: [] });
      }
      query = query.in('id', ids);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('Failed to fetch students', error);
      return NextResponse.json({ error: 'Unable to fetch students' }, { status: 500 });
    }

    return NextResponse.json({ students });
  } catch (err) {
    console.error('Fetch students failed', err);
    return NextResponse.json({ error: 'Unable to fetch students' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email } = body as { name?: unknown; email?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Student email is required' }, { status: 400 });
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

    const tempPassword = generateRandomPassword();
    const passwordHash = await hashPassword(tempPassword);

    const { data: student, error: insertError } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        name: trimmedName,
        role: 'student',
        password_hash: passwordHash,
        force_password_change: true,
        picture_url: null,
      })
      .select('id, email, name, role, picture_url, password_hash, force_password_change')
      .single();

    if (insertError) {
      console.error('Failed to create student', insertError);
      return NextResponse.json({ error: 'Unable to create student' }, { status: 500 });
    }

    // Link the new student to the creating faculty's roster.
    const { error: rosterError } = await supabase
      .from('faculty_students')
      .insert({ faculty_id: session.uid, student_id: student.id });

    if (rosterError) {
      console.error('Failed to link student to faculty roster', rosterError);
    }

    const origin = request.headers.get('origin') ?? 'http://localhost:3000';
    const loginUrl = `${origin}/login`;

    const emailResult = await sendStudentInvitationEmail(normalizedEmail, trimmedName, loginUrl, tempPassword);

    if (!emailResult.success) {
      return NextResponse.json(
        {
          student: { id: student.id, email: student.email, name: student.name, role: student.role },
          password: tempPassword,
          warning: 'Student created but the invitation email could not be sent. Please share the temporary password below with the student.',
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        student: { id: student.id, email: student.email, name: student.name, role: student.role },
        password: tempPassword,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create student failed', err);
    return NextResponse.json(
      { error: 'Unable to create student. Please try again later.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, name, email } = body as { id?: unknown; name?: unknown; email?: unknown };

  if (typeof id !== 'string' || id.trim().length === 0) {
    return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
  }

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Student email is required' }, { status: 400 });
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
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({ name: trimmedName, email: normalizedEmail })
      .eq('id', id)
      .select('id, email, name, role, picture_url')
      .single();

    if (updateError) {
      console.error('Failed to update student', updateError);
      return NextResponse.json({ error: 'Unable to update student' }, { status: 500 });
    }

    return NextResponse.json({ student: updated });
  } catch (err) {
    console.error('Update student failed', err);
    return NextResponse.json({ error: 'Unable to update student' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = body as { id?: unknown };

  if (typeof id !== 'string' || id.trim().length === 0) {
    return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete student', deleteError);
      return NextResponse.json({ error: 'Unable to delete student' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete student failed', err);
    return NextResponse.json({ error: 'Unable to delete student' }, { status: 500 });
  }
}
