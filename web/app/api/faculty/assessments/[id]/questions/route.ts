import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { citedSkillId, isMissingSkillColumn, isSkillId } from '@/app/lib/taylor-skills';
import { logAudit } from '@/app/lib/audit';
import { guardAssessmentEdit } from '@/app/lib/assessment-access';
import { minOptions, SHORT_ANSWER } from '@/app/lib/short-answer';
import { ESSAY_DEFAULT_POINTS, isEssay } from '@/app/lib/essay';
import { ESSAYS_NEED_MIGRATION, isEssayTypeRefused } from '@/app/lib/essay-grading';

const QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'essay'];

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

  const {
    content,
    options,
    correct_index,
    explanation,
    competency_ids,
    question_type,
    points,
    criteria_id,
    skill_id,
  } = body as {
    content?: unknown;
    options?: unknown;
    correct_index?: unknown;
    explanation?: unknown;
    competency_ids?: unknown;
    question_type?: unknown;
    points?: unknown;
    criteria_id?: unknown;
    /** The question's skill area: a Taylor's skill id. */
    skill_id?: unknown;
  };

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Question content is required' }, { status: 400 });
  }
  if (question_type !== undefined && (typeof question_type !== 'string' || !QUESTION_TYPES.includes(question_type))) {
    return NextResponse.json({ error: 'Invalid question type' }, { status: 400 });
  }
  const essay = isEssay(question_type);
  // An essay has no choices: the student writes, the instructor grades.
  const sanitizedOptions = essay
    ? []
    : Array.isArray(options)
      ? options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : [];
  if (sanitizedOptions.length < minOptions(question_type)) {
    return NextResponse.json(
      {
        error:
          question_type === SHORT_ANSWER
            ? 'A short answer question needs at least one accepted answer'
            : 'At least two options are required',
      },
      { status: 400 },
    );
  }
  const correctIndex = essay ? 0 : Number(correct_index);
  if (
    !essay &&
    (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= sanitizedOptions.length)
  ) {
    return NextResponse.json({ error: 'Invalid correct answer index' }, { status: 400 });
  }
  const competencyIds = Array.isArray(competency_ids)
    ? competency_ids.filter((c): c is string => typeof c === 'string')
    : [];

  try {
    const supabase = getSupabaseAdmin();
    const denied = await guardAssessmentEdit(supabase, session, { assessmentId });
    if (denied) return denied;

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', assessmentId)
      .single();
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // The FK can only prove the criterion exists, not that it belongs to this
    // assessment — that needs a composite key. Checked here instead.
    const criteriaId = typeof criteria_id === 'string' && criteria_id ? criteria_id : null;
    if (criteriaId) {
      const { data: criterion } = await supabase
        .from('assessment_criteria')
        .select('id')
        .eq('id', criteriaId)
        .eq('assessment_id', assessmentId)
        .maybeSingle();
      if (!criterion) {
        return NextResponse.json(
          { error: 'That criterion belongs to a different assessment' },
          { status: 400 },
        );
      }
    }

    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const row: Record<string, unknown> = {
      assessment_id: assessmentId,
      position: count ?? 0,
      content: content.trim(),
      options: sanitizedOptions,
      correct_index: correctIndex,
      question_type: typeof question_type === 'string' ? question_type : 'multiple_choice',
      // What an essay is worth out of; 1 for anything else, as before.
      points:
        typeof points === 'number' && Number.isInteger(points) && points >= 1
          ? points
          : essay
            ? ESSAY_DEFAULT_POINTS
            : 1,
      explanation: typeof explanation === 'string' ? explanation.trim() : '',
      criteria_id: criteriaId,
    };
    // Linked to the skill area chosen for it, or to the Taylor's skill its explanation cites (049).
    const skillId = isSkillId(skill_id) ? skill_id : citedSkillId(row.explanation);
    let inserted = await supabase
      .from('questions')
      .insert(skillId ? { ...row, skill_id: skillId } : row)
      .select()
      .single();
    if (skillId && isMissingSkillColumn(inserted.error)) {
      inserted = await supabase.from('questions').insert(row).select().single();
    }
    const { data: question, error } = inserted;

    if (essay && isEssayTypeRefused(error)) {
      return NextResponse.json({ error: ESSAYS_NEED_MIGRATION }, { status: 409 });
    }
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
