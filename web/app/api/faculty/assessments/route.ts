import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getFacultyStudentIds } from '@/app/lib/roster';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;
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
    const { data, error } = await supabase
      .from('assessments')
      .select(
        'id, created_by, title, description, difficulty, category, time_limit_seconds, is_published, is_ai_generated, target_sections, total_questions, max_attempts, created_at, updated_at, questions(count)',
      )
      .order('created_at', { ascending: false })
      .limit(500);

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
      session.role === 'faculty' ? await getFacultyStudentIds(supabase, session.uid) : null;

    const assignedCounts = new Map<string, number>();
    if (scopedIds === null || scopedIds.length > 0) {
      let assignmentQuery = supabase.from('assessment_assignments').select('assessment_id').limit(20000);
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
    }

    const assessments = (data ?? []).map((a) => ({
      id: a.id,
      created_by: a.created_by,
      title: a.title,
      description: a.description,
      difficulty: a.difficulty,
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
    }));

    return NextResponse.json({ assessments });
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

  const { title, description, difficulty, category, time_limit_seconds, target_sections } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    time_limit_seconds?: unknown;
    target_sections?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!validDifficulties.includes(difficulty as (typeof validDifficulties)[number])) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
  }
  if (!validCategories.includes(category as (typeof validCategories)[number])) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const timeLimit =
    time_limit_seconds === null || time_limit_seconds === undefined
      ? null
      : Number(time_limit_seconds);
  if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit <= 0)) {
    return NextResponse.json({ error: 'Invalid time limit' }, { status: 400 });
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

    const { data: assessment, error } = await supabase
      .from('assessments')
      .insert({
        created_by: session.uid,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        difficulty: difficulty as (typeof validDifficulties)[number],
        category: category as (typeof validCategories)[number],
        time_limit_seconds: timeLimit,
        target_sections: targetSectionNames.length > 0 ? targetSectionNames : null,
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
