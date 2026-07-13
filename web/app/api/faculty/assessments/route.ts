import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

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
        'id, created_by, title, description, difficulty, category, time_limit_seconds, is_published, is_ai_generated, target_sections, created_at, updated_at, questions(count), assessment_assignments(count)',
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Failed to fetch assessments', error);
      return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
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
      created_at: a.created_at,
      updated_at: a.updated_at,
      question_count: Number(
        (a as unknown as { questions: [{ count: number }] }).questions?.[0]?.count ?? 0,
      ),
      student_count: Number(
        (a as unknown as { assessment_assignments: [{ count: number }] })
          .assessment_assignments?.[0]?.count ?? 0,
      ),
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

  try {
    const supabase = getSupabaseAdmin();
    const { data: assessment, error } = await supabase
      .from('assessments')
      .insert({
        created_by: session.uid,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        difficulty: difficulty as (typeof validDifficulties)[number],
        category: category as (typeof validCategories)[number],
        time_limit_seconds: timeLimit,
        target_sections: Array.isArray(target_sections) ? target_sections : null,
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
