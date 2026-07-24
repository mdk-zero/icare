import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { readSession } from '@/app/lib/auth/session';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { getFacultySectionIds } from '@/app/lib/roster';
import { getLatestRiskByStudent, getLastActivityByStudent } from '@/app/lib/faculty-dashboard';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface SectionRef {
  id: string;
  name: string;
}

function withSectionName<T extends { sections?: unknown }>(row: T) {
  const { sections, ...rest } = row;
  const section = sections as unknown as SectionRef | null;
  return { ...rest, section_id: section?.id ?? null, section: section?.name ?? null };
}

/**
 * Resolves and validates the target section for create/update. Faculty may
 * only place students into sections they handle; admin may use any section.
 */
async function resolveSection(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  sectionId: string,
): Promise<{ error?: string; status?: number }> {
  const { data: section } = await supabase
    .from('sections')
    .select('id')
    .eq('id', sectionId)
    .maybeSingle();
  if (!section) {
    return { error: 'Section not found', status: 400 };
  }

  if (session.role === 'faculty') {
    const facultySections = await getFacultySectionIds(supabase, session.uid);
    if (!facultySections.includes(sectionId)) {
      return { error: 'You can only assign students to your own sections', status: 403 };
    }
  }
  return {};
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

    // Admin sees all students; faculty only students in their sections.
    let query = supabase
      .from('users')
      .select('id, email, name, role, picture_url, section_id, sections(id, name)')
      .eq('role', 'student')
      .order('name', { ascending: true });

    if (session.role === 'faculty') {
      const sectionIds = await getFacultySectionIds(supabase, session.uid);
      if (sectionIds.length === 0) {
        return NextResponse.json({ students: [] });
      }
      query = query.in('section_id', sectionIds);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('Failed to fetch students', error);
      return NextResponse.json({ error: 'Unable to fetch students' }, { status: 500 });
    }

    // risk_level and last_activity are what the roster and dashboard badge
    // students with; without them every row reads "no prediction" and blank.
    const ids = (students ?? []).map((s) => s.id);
    const [risks, activity] = await Promise.all([
      getLatestRiskByStudent(supabase, ids),
      getLastActivityByStudent(supabase, ids),
    ]);

    return NextResponse.json({
      students: (students ?? []).map((student) => ({
        ...withSectionName(student),
        risk_level: risks.get(student.id)?.risk ?? null,
        last_activity: activity.get(student.id) ?? null,
      })),
    });
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

  const { name, email, section_id } = body as {
    name?: unknown;
    email?: unknown;
    section_id?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Student email is required' }, { status: 400 });
  }

  if (typeof section_id !== 'string' || section_id.trim().length === 0) {
    return NextResponse.json({ error: 'Section is required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const sectionId = section_id.trim();

  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const sectionCheck = await resolveSection(supabase, session, sectionId);
    if (sectionCheck.error) {
      return NextResponse.json({ error: sectionCheck.error }, { status: sectionCheck.status });
    }

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
        section_id: sectionId,
      })
      .select('id, email, name, role, picture_url, section_id')
      .single();

    if (insertError) {
      console.error('Failed to create student', insertError);
      return NextResponse.json({ error: 'Unable to create student' }, { status: 500 });
    }

    const origin = request.headers.get('origin') ?? 'http://localhost:3000';
    const loginUrl = `${origin}/login`;

    const emailResult = await sendStudentInvitationEmail(normalizedEmail, trimmedName, loginUrl, tempPassword);

    if (!emailResult.success) {
      return NextResponse.json(
        {
          student: { id: student.id, email: student.email, name: student.name, role: student.role, section_id: student.section_id },
          password: tempPassword,
          warning: 'Student created but the invitation email could not be sent. Please share the temporary password below with the student.',
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        student: { id: student.id, email: student.email, name: student.name, role: student.role, section_id: student.section_id },
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

  const { id, name, email, section_id } = body as {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    section_id?: unknown;
  };

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

    const updates: Record<string, unknown> = { name: trimmedName, email: normalizedEmail };

    if (section_id !== undefined) {
      if (typeof section_id !== 'string' || section_id.trim().length === 0) {
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
      }
      const sectionCheck = await resolveSection(supabase, session, section_id.trim());
      if (sectionCheck.error) {
        return NextResponse.json({ error: sectionCheck.error }, { status: sectionCheck.status });
      }
      updates.section_id = section_id.trim();
    }

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
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, picture_url, section_id, sections(id, name)')
      .single();

    if (updateError) {
      console.error('Failed to update student', updateError);
      return NextResponse.json({ error: 'Unable to update student' }, { status: 500 });
    }

    return NextResponse.json({ student: withSectionName(updated) });
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
