import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { assessmentPublishBlockers } from '@/app/lib/assessment-validation';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data: assessment, error } = await supabase
      .from('assessments')
      .select(
        'id, created_by, title, description, difficulty, category, time_limit_seconds, is_published, is_ai_generated, target_sections, created_at, updated_at, questions(id, position, content, options, correct_index, question_type, points, explanation, difficulty, question_competencies(competency_id))',
      )
      .eq('id', id)
      .single();

    if (error || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const questions = (assessment.questions ?? [])
      .map((q) => ({
        id: q.id,
        position: q.position,
        content: q.content,
        options: Array.isArray(q.options) ? q.options : [],
        correct_index: q.correct_index,
        question_type: q.question_type ?? 'multiple_choice',
        points: q.points ?? 1,
        explanation: q.explanation,
        difficulty: q.difficulty,
        competency_ids: (
          (q as unknown as { question_competencies: { competency_id: string }[] })
            .question_competencies ?? []
        ).map((qc) => qc.competency_id),
      }))
      .sort((a, b) => a.position - b.position);

    return NextResponse.json({
      assessment: { ...assessment, questions },
    });
  } catch (err) {
    console.error('Fetch assessment failed', err);
    return NextResponse.json({ error: 'Unable to fetch assessment' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    title,
    description,
    difficulty,
    category,
    time_limit_seconds,
    is_published,
    target_sections,
    total_questions,
    max_attempts,
  } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    time_limit_seconds?: unknown;
    is_published?: unknown;
    target_sections?: unknown;
    total_questions?: unknown;
    max_attempts?: unknown;
  };

  const updates: Record<string, unknown> = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }
    updates.title = title.trim();
  }
  if (description !== undefined) {
    updates.description = typeof description === 'string' ? description.trim() : '';
  }
  if (difficulty !== undefined) {
    if (!validDifficulties.includes(difficulty as (typeof validDifficulties)[number])) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
    }
    updates.difficulty = difficulty;
  }
  if (category !== undefined) updates.category = category;
  if (time_limit_seconds !== undefined) {
    const t = time_limit_seconds === null ? null : Number(time_limit_seconds);
    if (t !== null && (!Number.isInteger(t) || t <= 0)) {
      return NextResponse.json({ error: 'Invalid time limit' }, { status: 400 });
    }
    updates.time_limit_seconds = t;
  }
  if (is_published !== undefined) {
    if (typeof is_published !== 'boolean') {
      return NextResponse.json({ error: 'Invalid is_published' }, { status: 400 });
    }
    updates.is_published = is_published;
  }
  if (target_sections !== undefined) {
    if (!Array.isArray(target_sections)) {
      return NextResponse.json({ error: 'Invalid target_sections' }, { status: 400 });
    }
    updates.target_sections = target_sections.length > 0 ? target_sections : null;
  }
  // null on either of these is meaningful: total_questions null serves the whole
  // bank, max_attempts null means unlimited retakes.
  if (total_questions !== undefined) {
    const n = total_questions === null ? null : Number(total_questions);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) {
      return NextResponse.json({ error: 'Questions per attempt must be a positive whole number' }, { status: 400 });
    }
    updates.total_questions = n;
  }
  if (max_attempts !== undefined) {
    const n = max_attempts === null ? null : Number(max_attempts);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) {
      return NextResponse.json({ error: 'Attempts allowed must be a positive whole number' }, { status: 400 });
    }
    updates.max_attempts = n;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Publishing is where a half-configured assessment has to be caught: past
    // this point selection is promising students a fixed paper size with every
    // criterion represented, and a gap shows up as a silent 0% rather than an
    // error. Applied on the incoming state, so a PATCH that publishes and sets
    // total_questions in one call is judged on what it is about to become.
    if (updates.is_published === true) {
      const blockers = await assessmentPublishBlockers(
        supabase,
        id,
        'total_questions' in updates
          ? { total_questions: updates.total_questions as number | null }
          : undefined,
      );
      if (blockers.length > 0) {
        return NextResponse.json({ error: blockers[0].message, blockers }, { status: 400 });
      }
    }

    const { data: assessment, error } = await supabase
      .from('assessments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !assessment) {
      console.error('Failed to update assessment', error);
      return NextResponse.json({ error: 'Unable to update assessment' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action:
          updates.is_published === true
            ? 'assessment.publish'
            : updates.is_published === false
              ? 'assessment.unpublish'
              : 'assessment.update',
        entityType: 'assessments',
        entityId: id,
        details: { updates },
      },
      request,
    );

    return NextResponse.json({ assessment });
  } catch (err) {
    console.error('Update assessment failed', err);
    return NextResponse.json({ error: 'Unable to update assessment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('assessments').delete().eq('id', id);

    if (error) {
      console.error('Failed to delete assessment', error);
      return NextResponse.json({ error: 'Unable to delete assessment' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'assessment.delete', entityType: 'assessments', entityId: id },
      request,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete assessment failed', err);
    return NextResponse.json({ error: 'Unable to delete assessment' }, { status: 500 });
  }
}
