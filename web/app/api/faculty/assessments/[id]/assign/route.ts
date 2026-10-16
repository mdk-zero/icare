import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { manageableSectionIds, manageableTeam } from '@/app/lib/teams';
import { parseDeadline } from '@/app/lib/deadline-input';
import { assessmentPublishBlockers } from '@/app/lib/assessment-validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
    ),
  ];
}

/**
 * GET → { assignments: [{ student_id, deadline }] }
 * Who already has the quiz, and by when, among the caller's students: the
 * Assign dialog shows it on each section and group.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: assessmentId } = await params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('assessment_assignments')
      .select('student_id, deadline')
      .eq('assessment_id', assessmentId)
      .limit(5000);
    if (error) throw error;
    const scope = await getScopedStudentIds(supabase, session);
    const mine = scope ? new Set(scope) : null;
    return NextResponse.json({
      assignments: (data ?? []).filter((a) => !mine || mine.has(a.student_id as string)),
    });
  } catch (err) {
    console.error('Failed to read quiz assignments', err);
    return NextResponse.json({ error: 'Unable to read who has this quiz' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assessmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { section_ids, team_ids, student_ids, deadline, required, max_attempts } = body as {
    section_ids?: unknown;
    team_ids?: unknown;
    student_ids?: unknown;
    deadline?: unknown;
    required?: unknown;
    max_attempts?: unknown;
  };

  // Assignment is section-based; student_ids stays accepted so a caller can
  // still name individuals, and the two are unioned.
  // A quiz goes to whole sections, to groups, and to students added to the
  // course by hand; the three are unioned.
  const sectionIds = uniqueStrings(section_ids);
  const teamIds = uniqueStrings(team_ids);
  const studentIds = uniqueStrings(student_ids);
  if (sectionIds.length === 0 && teamIds.length === 0 && studentIds.length === 0) {
    return NextResponse.json({ error: 'Choose who gets this quiz' }, { status: 400 });
  }
  // Read as optional here; once the assessment is loaded, it is required
  // unless the assessment has a deadline of its own for assignments to inherit.
  const deadlineCheck = parseDeadline(deadline, { optional: true });
  if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });
  const deadlineValue = deadlineCheck.value ? new Date(deadlineCheck.value) : null;
  const attemptsOverride =
    max_attempts === undefined || max_attempts === null ? null : Number(max_attempts);
  if (attemptsOverride !== null && (!Number.isInteger(attemptsOverride) || attemptsOverride <= 0)) {
    return NextResponse.json(
      { error: 'Attempts allowed must be a positive whole number' },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, title, target_sections, deadline, is_published')
      .eq('id', assessmentId)
      .single();
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }
    // Assigning is what puts a quiz in front of students, so a draft is
    // published here, under the same checks as publishing it any other way.
    if (!assessment.is_published) {
      const blockers = await assessmentPublishBlockers(supabase, assessmentId);
      if (blockers.length > 0) {
        return NextResponse.json({ error: blockers[0].message, blockers }, { status: 400 });
      }
    }
    if (!deadlineValue && !assessment.deadline) {
      return NextResponse.json({ error: 'Set a deadline' }, { status: 400 });
    }

    // Faculty reach only the sections they handle; admin may use any.
    if (session.role === 'faculty' && sectionIds.length > 0) {
      const own = new Set(await manageableSectionIds(supabase, session.role, session.uid));
      const outside = sectionIds.filter((id) => !own.has(id));
      if (outside.length > 0) {
        return NextResponse.json(
          { error: 'You can only assign to sections you handle', invalid: outside },
          { status: 403 },
        );
      }
    }

    let sections: { id: string; name: string }[] = [];
    if (sectionIds.length > 0) {
      const { data: sectionRows, error: sectionError } = await supabase
        .from('sections')
        .select('id, name')
        .in('id', sectionIds);
      // A malformed id fails the query outright; either way the ids on hand
      // don't all name a section.
      if (sectionError) console.error('Failed to resolve sections', sectionError);
      sections = sectionRows ?? [];
      if (sections.length !== sectionIds.length) {
        return NextResponse.json({ error: 'Section not found' }, { status: 400 });
      }
    }

    // Resolved here rather than trusting a list built in the browser: a roster
    // fetched before a student transferred in would quietly skip them.
    const recipients = new Set(studentIds);
    // Sections reached through a group, so the quiz's sections stay a true record.
    const groupSectionIds = new Set<string>();
    if (sectionIds.length > 0) {
      const { data: sectionStudents, error: studentsError } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'student')
        .in('section_id', sectionIds)
        .limit(5000);
      if (studentsError) {
        console.error('Failed to resolve section students', studentsError);
        return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
      }
      // A faculty member giving it to a section gives it to their own group
      // members there, not to the whole section.
      const roster = await getScopedStudentIds(supabase, session).then((ids) => (ids ? new Set(ids) : null));
      for (const student of sectionStudents ?? []) {
        if (!roster || roster.has(student.id)) recipients.add(student.id);
      }
    }

    // A group's members, for the groups the caller manages.
    if (teamIds.length > 0) {
      for (const teamId of teamIds) {
        if (!(await manageableTeam(supabase, session.role, session.uid, teamId))) {
          return NextResponse.json({ error: 'You can only assign to groups you supervise' }, { status: 403 });
        }
      }
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('student_id, teams(section_id)')
        .in('team_id', teamIds);
      if (membersError) {
        console.error('Failed to resolve group members', membersError);
        return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
      }
      for (const m of members ?? []) {
        recipients.add(m.student_id as string);
        const sectionId = (m.teams as unknown as { section_id?: string } | null)?.section_id;
        if (sectionId && !sectionIds.includes(sectionId)) groupSectionIds.add(sectionId);
      }
    }

    if (session.role === 'faculty' && studentIds.length > 0) {
      const roster = new Set(await getFacultyStudentIds(supabase, session.uid));
      const invalid = studentIds.filter((id) => !roster.has(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: 'Some students are not in your groups', invalid },
          { status: 403 },
        );
      }
    }

    const targetIds = [...recipients];
    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: 'No students in the selected sections yet' },
        { status: 400 },
      );
    }

    // Re-assigning a section is how a deadline gets changed, so only students
    // who did not already have this quiz are worth a notification.
    const { data: alreadyAssigned } = await supabase
      .from('assessment_assignments')
      .select('student_id')
      .eq('assessment_id', assessmentId)
      .in('student_id', targetIds);
    const existingIds = new Set((alreadyAssigned ?? []).map((a) => a.student_id));

    const rows = targetIds.map((student_id) => ({
      assessment_id: assessmentId,
      student_id,
      assigned_by: session.uid,
      deadline: deadlineValue ? deadlineValue.toISOString() : null,
      required: typeof required === 'boolean' ? required : true,
      // Overrides the assessment's own limit for these students; null falls
      // back to it.
      max_attempts: attemptsOverride,
    }));

    const { data: assignments, error } = await supabase
      .from('assessment_assignments')
      .upsert(rows, { onConflict: 'assessment_id,student_id', ignoreDuplicates: false })
      .select();

    if (error) {
      console.error('Failed to assign assessment', error);
      return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
    }

    // Students only ever see assessments their section is targeted by, so
    // assigning to a section it was not published to would hand out a quiz
    // that never appears. Widen the visibility to match the assignment. A
    // quiz still open to every section is narrowed to the sections it is
    // assigned to: assigning says who it is for.
    const currentTargets = (assessment.target_sections as string[] | null) ?? [];
    let targetSections = currentTargets;
    const { data: groupSections } = groupSectionIds.size
      ? await supabase.from('sections').select('name').in('id', [...groupSectionIds])
      : { data: [] as { name: string }[] };
    const assignedNames = [...sections.map((s) => s.name), ...(groupSections ?? []).map((s) => s.name as string)];
    const addedSections = assignedNames.filter((name) => !currentTargets.includes(name));
    if (addedSections.length > 0 || !assessment.is_published) {
      targetSections = [...currentTargets, ...addedSections];
      const { error: visibilityError } = await supabase
        .from('assessments')
        .update({ target_sections: targetSections, is_published: true })
        .eq('id', assessmentId);
      if (visibilityError) {
        console.error('Failed to widen assessment visibility', visibilityError);
      }
    }

    const newlyAssigned = targetIds.filter((id) => !existingIds.has(id));
    if (newlyAssigned.length > 0) {
      // In-app notification for each student (FCM delivery comes later).
      const { error: notifyError } = await supabase.from('notifications').insert(
        newlyAssigned.map((user_id) => ({
          user_id,
          type: 'assignment_created',
          title: 'New quiz assigned',
          body: `You have been assigned "${assessment.title}".`,
          data: { kind: 'quiz', assessment_id: assessmentId },
        })),
      );
      if (notifyError) console.error('Failed to create assignment notifications', notifyError);
    }

    await logAudit(
      session,
      {
        action: 'assessment.assign',
        entityType: 'assessments',
        entityId: assessmentId,
        details: {
          section_ids: sectionIds,
          sections: sections.map((s) => s.name),
          student_count: targetIds.length,
          deadline: deadlineValue?.toISOString() ?? null,
        },
      },
      request,
    );

    return NextResponse.json(
      {
        assignments: assignments ?? [],
        student_count: targetIds.length,
        sections: sections.map((s) => s.name),
        target_sections: currentTargets.length > 0 ? targetSections : null,
        // Named so the caller can tell the faculty member their quiz just
        // became visible to a section they had not published it to.
        added_sections: addedSections,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Assign assessment failed', err);
    return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
  }
}
