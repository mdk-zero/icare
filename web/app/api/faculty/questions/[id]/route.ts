import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
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

  const { content, options, correct_index, explanation, position, competency_ids, question_type, points } =
    body as {
      content?: unknown;
      options?: unknown;
      correct_index?: unknown;
      explanation?: unknown;
      position?: unknown;
      competency_ids?: unknown;
      question_type?: unknown;
      points?: unknown;
    };

  const updates: Record<string, unknown> = {};
  let sanitizedOptions: string[] | null = null;

  if (content !== undefined) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
    }
    updates.content = content.trim();
  }
  if (options !== undefined) {
    sanitizedOptions = Array.isArray(options)
      ? options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : [];
    if (sanitizedOptions.length < 2) {
      return NextResponse.json({ error: 'At least two options are required' }, { status: 400 });
    }
    updates.options = sanitizedOptions;
  }
  if (correct_index !== undefined) {
    const ci = Number(correct_index);
    if (!Number.isInteger(ci) || ci < 0) {
      return NextResponse.json({ error: 'Invalid correct answer index' }, { status: 400 });
    }
    updates.correct_index = ci;
  }
  if (question_type !== undefined) {
    const validTypes = ['multiple_choice', 'true_false', 'short_answer'];
    if (typeof question_type !== 'string' || !validTypes.includes(question_type)) {
      return NextResponse.json({ error: 'Invalid question type' }, { status: 400 });
    }
    updates.question_type = question_type;
  }
  if (points !== undefined) {
    const p = Number(points);
    if (!Number.isInteger(p) || p < 1) {
      return NextResponse.json({ error: 'Points must be a positive integer' }, { status: 400 });
    }
    updates.points = p;
  }
  if (explanation !== undefined) {
    updates.explanation = typeof explanation === 'string' ? explanation.trim() : '';
  }
  if (position !== undefined) {
    const p = Number(position);
    if (!Number.isInteger(p) || p < 0) {
      return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
    }
    updates.position = p;
  }

  try {
    const supabase = getSupabaseAdmin();

    if (Object.keys(updates).length > 0) {
      // Keep correct_index within the (possibly updated) options bounds.
      const { data: existing } = await supabase
        .from('questions')
        .select('options, correct_index')
        .eq('id', id)
        .single();
      if (!existing) {
        return NextResponse.json({ error: 'Question not found' }, { status: 404 });
      }
      const finalOptions =
        sanitizedOptions ?? ((existing.options as string[] | null) ?? []);
      const finalCorrect = Number(
        updates.correct_index !== undefined ? updates.correct_index : existing.correct_index,
      );
      if (finalCorrect >= finalOptions.length) {
        return NextResponse.json(
          { error: 'Correct answer index is out of range for the options' },
          { status: 400 },
        );
      }

      const { error } = await supabase.from('questions').update(updates).eq('id', id);
      if (error) {
        console.error('Failed to update question', error);
        return NextResponse.json({ error: 'Unable to update question' }, { status: 500 });
      }
    }

    if (competency_ids !== undefined) {
      const competencyIds = Array.isArray(competency_ids)
        ? competency_ids.filter((c): c is string => typeof c === 'string')
        : [];
      await supabase.from('question_competencies').delete().eq('question_id', id);
      if (competencyIds.length > 0) {
        const { error: tagError } = await supabase.from('question_competencies').insert(
          competencyIds.map((competency_id) => ({ question_id: id, competency_id })),
        );
        if (tagError) console.error('Failed to retag question competencies', tagError);
      }
    }

    await logAudit(
      session,
      { action: 'question.update', entityType: 'questions', entityId: id },
      request,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Update question failed', err);
    return NextResponse.json({ error: 'Unable to update question' }, { status: 500 });
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
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete question', error);
      return NextResponse.json({ error: 'Unable to delete question' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'question.delete', entityType: 'questions', entityId: id },
      request,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete question failed', err);
    return NextResponse.json({ error: 'Unable to delete question' }, { status: 500 });
  }
}
