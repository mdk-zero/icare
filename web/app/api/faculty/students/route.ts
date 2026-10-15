import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent, getScopedStudentIds } from '@/app/lib/admin-scope';
import { readSession } from '@/app/lib/auth/session';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { getFacultySectionIds, getFacultyStudentIds } from '@/app/lib/roster';
import { parseSex } from '@/app/lib/auth/user';
import { getLatestRiskByStudent, getLastActivityByStudent } from '@/app/lib/faculty-dashboard';
import { logAudit } from '@/app/lib/audit';
import { isMissingTeamTables, manageableTeam, TEAMS_NEED_MIGRATION } from '@/app/lib/teams';

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

    // Faculty see the members of the groups they supervise; an admin their own students.
    let query = supabase
      .from('users')
      .select('id, email, name, role, picture_url, sex, section_id, sections(id, name)')
      .eq('role', 'student')
      .order('name', { ascending: true });

    const studentIds = await getScopedStudentIds(supabase, session);
    if (studentIds) {
      if (studentIds.length === 0) {
        return NextResponse.json({ students: [] });
      }
      query = query.in('id', studentIds);
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

/**
 * POST { name, email, sex?, team_id?, section_id? }: register a student.
 *
 * An instructor registers into one of the groups they supervise (`team_id`,
 * required): the account goes into that group's section and the group in one
 * step, since a student in no group of theirs is not on their roster. An
 * admin may give a section alone. The temporary password is emailed to the
 * student and also returned, in case the email doesn't land.
 */
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

  const { name, email, section_id, sex, team_id } = body as {
    name?: unknown;
    email?: unknown;
    section_id?: unknown;
    sex?: unknown;
    team_id?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Student email is required' }, { status: 400 });
  }

  const teamId = typeof team_id === 'string' && team_id.trim() ? team_id.trim() : null;
  if (session.role === 'faculty' && !teamId) {
    return NextResponse.json({ error: 'Choose one of your groups for the student' }, { status: 400 });
  }
  const givenSectionId = typeof section_id === 'string' ? section_id.trim() : '';
  if (!teamId && !givenSectionId) {
    return NextResponse.json({ error: 'Section is required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  const parsedSex = parseSex(sex);
  if (parsedSex.error) {
    return NextResponse.json({ error: parsedSex.error }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // The group decides the section: an instructor's must be one they
    // supervise, an admin's one in their sections.
    let team: { id: string; name: string; section_id: string } | null = null;
    if (teamId) {
      const { data } = await supabase
        .from('teams')
        .select('id, name, section_id, faculty_id')
        .eq('id', teamId)
        .maybeSingle();
      const allowed =
        data &&
        (session.role === 'faculty'
          ? data.faculty_id === session.uid
          : Boolean(await manageableTeam(supabase, session.role, session.uid, teamId)));
      if (!data || !allowed) {
        return NextResponse.json({ error: 'You can only register students into your own groups' }, { status: 403 });
      }
      if (givenSectionId && givenSectionId !== data.section_id) {
        return NextResponse.json({ error: 'The group is in a different section' }, { status: 400 });
      }
      team = { id: data.id as string, name: data.name as string, section_id: data.section_id as string };
    }
    const sectionId = team?.section_id ?? givenSectionId;

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
        sex: parsedSex.sex ?? null,
        password_hash: passwordHash,
        force_password_change: true,
        picture_url: null,
        section_id: sectionId,
      })
      .select('id, email, name, role, picture_url, sex, section_id')
      .single();

    if (insertError) {
      console.error('Failed to create student', insertError);
      return NextResponse.json({ error: 'Unable to create student' }, { status: 500 });
    }

    if (team) {
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({ team_id: team.id, student_id: student.id });
      if (memberError) {
        // An instructor can't see a student outside their groups, so a
        // half-made registration would be lost to them: take it back.
        console.error('Failed to add the new student to their group', memberError);
        await supabase.from('users').delete().eq('id', student.id).eq('role', 'student');
        const message = isMissingTeamTables(memberError) ? TEAMS_NEED_MIGRATION : 'Unable to add the student to the group';
        return NextResponse.json({ error: message }, { status: isMissingTeamTables(memberError) ? 503 : 500 });
      }
    }

    await logAudit(
      session,
      {
        action: 'user.create',
        entityType: 'users',
        entityId: student.id,
        details: {
          role: 'student',
          message: `Registered ${trimmedName}${team ? ` into ${team.name}` : ''}`,
          section_id: sectionId,
          ...(team ? { team_id: team.id, team: team.name } : {}),
        },
      },
      request,
    );

    const created = {
      id: student.id,
      email: student.email,
      name: student.name,
      role: student.role,
      section_id: student.section_id,
      team_id: team?.id ?? null,
    };
    const emailResult = await sendStudentInvitationEmail(normalizedEmail, trimmedName, tempPassword);

    if (!emailResult.success) {
      return NextResponse.json(
        {
          student: created,
          password: tempPassword,
          warning: 'Student created but the invitation email could not be sent. Please share the temporary password below with the student.',
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ student: created, password: tempPassword }, { status: 201 });
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

  const { id, name, email, section_id, sex } = body as {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    section_id?: unknown;
    sex?: unknown;
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

    const parsedSex = parseSex(sex);
    if (parsedSex.error) {
      return NextResponse.json({ error: parsedSex.error }, { status: 400 });
    }
    // Absent leaves the recorded value alone; an explicit empty clears it.
    if (parsedSex.sex !== undefined) updates.sex = parsedSex.sex;

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
      .select('id, email, name, role, picture_url, sex, section_id, sections(id, name)')
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

  const { id } = body as { id?: unknown };

  if (typeof id !== 'string' || id.trim().length === 0) {
    return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Only ever target students, and scope faculty to their own sections so
    // a faculty account can't delete a student (or worse, a faculty/admin
    // account) outside its roster.
    const { data: target } = await supabase
      .from('users')
      .select('id, role, section_id')
      .eq('id', id)
      .maybeSingle();

    if (!target || target.role !== 'student') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!(await canSeeStudent(supabase, session, id))) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .eq('role', 'student');

    if (deleteError) {
      console.error('Failed to delete student', deleteError);
      return NextResponse.json({ error: 'Unable to delete student' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'user.delete', entityType: 'users', entityId: id },
      request,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete student failed', err);
    return NextResponse.json({ error: 'Unable to delete student' }, { status: 500 });
  }
}
