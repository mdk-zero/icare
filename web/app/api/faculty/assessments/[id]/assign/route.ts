import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getFacultySectionIds, getFacultyStudentIds } from '@/app/lib/roster';

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

  const { section_ids, student_ids, deadline, required, max_attempts } = body as {
    section_ids?: unknown;
    student_ids?: unknown;
    deadline?: unknown;
    required?: unknown;
    max_attempts?: unknown;
  };

  // Assignment is section-based; student_ids stays accepted so a caller can
  // still name individuals, and the two are unioned.
  const sectionIds = uniqueStrings(section_ids);
  const studentIds = uniqueStrings(student_ids);
  if (sectionIds.length === 0 && studentIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one section' }, { status: 400 });
  }
  const deadlineValue =
    typeof deadline === 'string' && deadline.length > 0 ? new Date(deadline) : null;
  if (deadlineValue && Number.isNaN(deadlineValue.getTime())) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }
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
      .select('id, title, target_sections')
      .eq('id', assessmentId)
      .single();
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Faculty reach only the sections they handle; admin may use any.
    if (session.role === 'faculty' && sectionIds.length > 0) {
      const own = new Set(await getFacultySectionIds(supabase, session.uid));
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
      for (const student of sectionStudents ?? []) recipients.add(student.id);
    }

    if (session.role === 'faculty' && studentIds.length > 0) {
      const roster = new Set(await getFacultyStudentIds(supabase, session.uid));
      const invalid = studentIds.filter((id) => !roster.has(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: 'Some students are not in your sections', invalid },
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
    // that never appears. Widen the visibility to match the assignment.
    const currentTargets = (assessment.target_sections as string[] | null) ?? [];
    let targetSections = currentTargets;
    const addedSections = sections
      .map((s) => s.name)
      .filter((name) => !currentTargets.includes(name));
    // An empty target_sections already means "every section"; nothing to widen.
    if (currentTargets.length > 0 && addedSections.length > 0) {
      targetSections = [...currentTargets, ...addedSections];
      const { error: visibilityError } = await supabase
        .from('assessments')
        .update({ target_sections: targetSections })
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
          data: { assessment_id: assessmentId },
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
        added_sections: currentTargets.length > 0 ? addedSections : [],
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Assign assessment failed', err);
    return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
  }
}
