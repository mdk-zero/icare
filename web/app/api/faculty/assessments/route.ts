import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_ATTEMPTS, isValidAttempts, MIN_ATTEMPTS } from '@/app/lib/quiz-attempts';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { activityCourse, activityCoursesReady, activityOfferings, parseOfferingId } from '@/app/lib/activity-course';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { assignedGroups, type AssignedGroup } from '@/app/lib/assigned-groups';
import { logAudit } from '@/app/lib/audit';
import { viewerDeanId } from '@/app/lib/dean-scope';

const validCategories = [
  'Cardiac Emergency',
  'Respiratory Emergency',
  'Neurological Emergency',
  'Trauma',
  'Medical-Surgical',
  'Patient Education',
  'Infection Management',
  'Critical Care',
  'Medication Safety',
  'General',
] as const;

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    // The quizzes of the viewer's own Dean only (077).
    const deanId = await viewerDeanId(supabase, session);
    let quizQuery = supabase
      .from('assessments')
      .select(
        'id, created_by, title, description, category, time_limit_seconds, is_published, is_ai_generated, target_sections, total_questions, max_attempts, created_at, updated_at, questions(count)',
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (deanId) quizQuery = quizQuery.eq('admin_id', deanId);
    const { data, error } = await quizQuery;

    if (error) {
      console.error('Failed to fetch assessments', error);
      return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
    }

    // "N assigned" has to count the same students the results page lists, so a
    // faculty member's number covers only their own sections -- otherwise a card
    // reads "8 assigned" for a quiz given entirely to another section's
    // students, and opening it shows none of them. Admin is unscoped.
    //
    // Counted here rather than with an embedded assessment_assignments(count),
    // which cannot be filtered by student. The roster is the smaller `in` list,
    // so it is the one that goes in the query.
    const scopedIds =
      await getScopedStudentIds(supabase, session);

    const assignedCounts = new Map<string, number>();
    let groupsOf = new Map<string, AssignedGroup[]>();
    if (scopedIds === null || scopedIds.length > 0) {
      let assignmentQuery = supabase.from('assessment_assignments').select('assessment_id, student_id, deadline').limit(20000);
      if (scopedIds) assignmentQuery = assignmentQuery.in('student_id', scopedIds);
      const { data: assignments, error: assignmentsError } = await assignmentQuery;
      if (assignmentsError) {
        console.error('Failed to count assessment assignments', assignmentsError);
        return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
      }
      for (const row of assignments ?? []) {
        const key = row.assessment_id as string;
        assignedCounts.set(key, (assignedCounts.get(key) ?? 0) + 1);
      }
      // Which groups have each quiz, and by when.
      groupsOf = await assignedGroups(
        supabase,
        (assignments ?? []).map((row) => ({
          activity_id: row.assessment_id as string,
          student_id: row.student_id as string,
          deadline: (row.deadline as string | null) ?? null,
        })),
      );
    }

    // The course each quiz was made for (070), for grouping by course.
    const offeringOf = await activityOfferings(supabase, 'assessments', (data ?? []).map((a) => a.id as string));

    const assessments = (data ?? []).map((a) => ({
      id: a.id,
      created_by: a.created_by,
      title: a.title,
      description: a.description,
      category: a.category,
      time_limit_seconds: a.time_limit_seconds,
      is_published: a.is_published,
      is_ai_generated: a.is_ai_generated,
      target_sections: a.target_sections,
      // null total_questions serves the whole bank; null max_attempts is
      // unlimited retakes.
      total_questions: a.total_questions,
      max_attempts: a.max_attempts,
      created_at: a.created_at,
      updated_at: a.updated_at,
      question_count: Number(
        (a as unknown as { questions: [{ count: number }] }).questions?.[0]?.count ?? 0,
      ),
      student_count: assignedCounts.get(a.id) ?? 0,
      assigned_groups: groupsOf.get(a.id as string) ?? [],
      offering_id: offeringOf.get(a.id as string) ?? null,
    }));

    // False until migration 070: a quiz's course can't be stored, so every
    // quiz lands under "Not in a course" whatever course was chosen.
    const course_links_ready = await activityCoursesReady(supabase, 'assessments');
    return NextResponse.json({ assessments, course_links_ready });
  } catch (err) {
    console.error('Fetch assessments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, category, time_limit_seconds, max_attempts, target_sections } = body as {
    title?: unknown;
    description?: unknown;
    category?: unknown;
    time_limit_seconds?: unknown;
    max_attempts?: unknown;
    target_sections?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  // The form no longer asks for a category; one sent anyway must be valid.
  const quizCategory = category === undefined || category === null || category === '' ? 'General' : category;
  if (!validCategories.includes(quizCategory as (typeof validCategories)[number])) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const timeLimit =
    time_limit_seconds === null || time_limit_seconds === undefined
      ? null
      : Number(time_limit_seconds);
  if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit <= 0)) {
    return NextResponse.json({ error: 'Invalid time limit' }, { status: 400 });
  }
  const maxAttempts =
    max_attempts === null || max_attempts === undefined || max_attempts === '' ? DEFAULT_ATTEMPTS : Number(max_attempts);
  if (!isValidAttempts(maxAttempts)) {
    return NextResponse.json({ error: `Attempts allowed must be a whole number, at least ${MIN_ATTEMPTS}` }, { status: 400 });
  }
  // Section names, not ids. Empty means every section sees it.
  if (target_sections !== undefined && target_sections !== null) {
    if (!Array.isArray(target_sections) || target_sections.some((s) => typeof s !== 'string')) {
      return NextResponse.json({ error: 'Invalid target_sections' }, { status: 400 });
    }
  }
  const targetSectionNames = Array.isArray(target_sections)
    ? [...new Set((target_sections as string[]).map((s) => s.trim()).filter(Boolean))]
    : [];

  try {
    const supabase = getSupabaseAdmin();

    // A name that matches no section would hide the assessment from everyone.
    if (targetSectionNames.length > 0) {
      const { data: known } = await supabase
        .from('sections')
        .select('name')
        .in('name', targetSectionNames);
      const knownNames = new Set((known ?? []).map((s) => s.name));
      const unknown = targetSectionNames.filter((name) => !knownNames.has(name));
      if (unknown.length > 0) {
        return NextResponse.json(
          { error: `Unknown section: ${unknown.join(', ')}` },
          { status: 400 },
        );
      }
    }

    const course = await activityCourse(
      supabase,
      'assessments',
      session,
      parseOfferingId((body ?? {}) as Record<string, unknown>),
    );
    if ('error' in course) return NextResponse.json({ error: course.error }, { status: 400 });

    // A quiz made for a course is seen by that course's sections, not every
    // section, unless sections were chosen.
    let visibleTo = targetSectionNames;
    if (visibleTo.length === 0 && course.value.offering_id) {
      const { data: links } = await supabase
        .from('course_offering_sections')
        .select('sections(name)')
        .eq('offering_id', course.value.offering_id);
      visibleTo = [
        ...new Set(
          ((links ?? []) as unknown as { sections: { name?: string } | null }[])
            .map((l) => l.sections?.name)
            .filter((n): n is string => !!n),
        ),
      ];
    }

    const { data: assessment, error } = await supabase
      .from('assessments')
      .insert({
        created_by: session.uid,
        ...course.value,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        category: quizCategory as (typeof validCategories)[number],
        time_limit_seconds: timeLimit,
        max_attempts: maxAttempts,
        target_sections: visibleTo.length > 0 ? visibleTo : null,
      })
      .select()
      .single();

    if (error || !assessment) {
      console.error('Failed to create assessment', error);
      return NextResponse.json({ error: 'Unable to create assessment' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'assessment.create',
        entityType: 'assessments',
        entityId: assessment.id,
        details: { title: assessment.title },
      },
      request,
    );

    return NextResponse.json({ assessment }, { status: 201 });
  } catch (err) {
    console.error('Create assessment failed', err);
    return NextResponse.json({ error: 'Unable to create assessment' }, { status: 500 });
  }
}
