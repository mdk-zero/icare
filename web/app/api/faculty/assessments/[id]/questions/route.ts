import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
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

  const { content, options, correct_index, explanation, competency_ids } = body as {
    content?: unknown;
    options?: unknown;
    correct_index?: unknown;
    explanation?: unknown;
    competency_ids?: unknown;
  };

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Question content is required' }, { status: 400 });
  }
  const sanitizedOptions = Array.isArray(options)
    ? options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : [];
  if (sanitizedOptions.length < 2) {
    return NextResponse.json({ error: 'At least two options are required' }, { status: 400 });
  }
  const correctIndex = Number(correct_index);
  if (
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= sanitizedOptions.length
  ) {
    return NextResponse.json({ error: 'Invalid correct answer index' }, { status: 400 });
  }
  const competencyIds = Array.isArray(competency_ids)
    ? competency_ids.filter((c): c is string => typeof c === 'string')
    : [];

  try {
    const supabase = getSupabaseAdmin();

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', assessmentId)
      .single();
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const { data: question, error } = await supabase
      .from('questions')
      .insert({
        assessment_id: assessmentId,
        position: count ?? 0,
        content: content.trim(),
        options: sanitizedOptions,
        correct_index: correctIndex,
        explanation: typeof explanation === 'string' ? explanation.trim() : '',
      })
      .select()
      .single();

    if (error || !question) {
      console.error('Failed to create question', error);
      return NextResponse.json({ error: 'Unable to create question' }, { status: 500 });
    }

    if (competencyIds.length > 0) {
      const { error: tagError } = await supabase.from('question_competencies').insert(
        competencyIds.map((competency_id) => ({ question_id: question.id, competency_id })),
      );
      if (tagError) console.error('Failed to tag question competencies', tagError);
    }

    await logAudit(
      session,
      {
        action: 'question.create',
        entityType: 'questions',
        entityId: question.id,
        details: { assessment_id: assessmentId },
      },
      request,
    );

    return NextResponse.json(
      { question: { ...question, competency_ids: competencyIds } },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create question failed', err);
    return NextResponse.json({ error: 'Unable to create question' }, { status: 500 });
  }
}
