import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SubmittedAnswer {
  question_id: string;
  selected_index: number | null;
  time_spent_seconds?: number;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: attemptId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawAnswers = (body as { answers?: unknown }).answers;
  if (!Array.isArray(rawAnswers)) {
    return NextResponse.json({ error: 'answers array is required' }, { status: 400 });
  }
  const answers: SubmittedAnswer[] = rawAnswers
    .filter(
      (a): a is { question_id: string; selected_index: unknown; time_spent_seconds?: unknown } =>
        !!a && typeof a === 'object' && typeof (a as { question_id?: unknown }).question_id === 'string',
    )
    .map((a) => ({
      question_id: a.question_id,
      selected_index:
        a.selected_index === null || a.selected_index === undefined
          ? null
          : Number(a.selected_index),
      time_spent_seconds:
        a.time_spent_seconds === undefined ? undefined : Math.max(0, Number(a.time_spent_seconds)),
    }));

  try {
    const supabase = getSupabaseAdmin();

    const { data: attempt } = await supabase
      .from('assessment_attempts')
      .select('id, assessment_id, student_id, assignment_id, status, started_at')
      .eq('id', attemptId)
      .single();

    if (!attempt || attempt.student_id !== session.uid) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
    }

    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id, correct_index, explanation, position')
      .eq('assessment_id', attempt.assessment_id);

    if (qError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'Unable to grade attempt' }, { status: 500 });
    }

    const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));
    const graded = questions.map((q) => {
      const submitted = answerByQuestion.get(q.id);
      const selected =
        submitted?.selected_index !== null &&
        submitted?.selected_index !== undefined &&
        Number.isInteger(submitted.selected_index)
          ? submitted.selected_index
          : null;
      return {
        question_id: q.id,
        position: q.position,
        selected_index: selected,
        correct_index: q.correct_index,
        explanation: q.explanation,
        is_correct: selected !== null && selected === q.correct_index,
        time_spent_seconds: submitted?.time_spent_seconds ?? null,
      };
    });

    const correctCount = graded.filter((g) => g.is_correct).length;
    const score = Math.round((correctCount / questions.length) * 10000) / 100;
    const timeTaken = Math.max(
      0,
      Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
    );

    const { error: answersError } = await supabase.from('attempt_answers').insert(
      graded.map((g) => ({
        attempt_id: attemptId,
        question_id: g.question_id,
        selected_index: g.selected_index,
        is_correct: g.is_correct,
        time_spent_seconds: g.time_spent_seconds,
      })),
    );
    if (answersError) {
      console.error('Failed to save attempt answers', answersError);
      return NextResponse.json({ error: 'Unable to save answers' }, { status: 500 });
    }

    const { error: attemptError } = await supabase
      .from('assessment_attempts')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        score,
        time_taken_seconds: timeTaken,
      })
      .eq('id', attemptId);
    if (attemptError) {
      console.error('Failed to finalize attempt', attemptError);
      return NextResponse.json({ error: 'Unable to finalize attempt' }, { status: 500 });
    }

    if (attempt.assignment_id) {
      await supabase
        .from('assessment_assignments')
        .update({ status: 'completed' })
        .eq('id', attempt.assignment_id);
    }

    await logAudit(
      session,
      {
        action: 'quiz.submit',
        entityType: 'assessment_attempts',
        entityId: attemptId,
        details: {
          assessment_id: attempt.assessment_id,
          score,
          correct: correctCount,
          total: questions.length,
          time_taken_seconds: timeTaken,
        },
      },
      request,
    );

    return NextResponse.json({
      score,
      correct: correctCount,
      total: questions.length,
      time_taken_seconds: timeTaken,
      results: graded
        .sort((a, b) => a.position - b.position)
        .map((g) => ({
          question_id: g.question_id,
          selected_index: g.selected_index,
          correct_index: g.correct_index,
          is_correct: g.is_correct,
          explanation: g.explanation,
        })),
    });
  } catch (err) {
    console.error('Submit attempt failed', err);
    return NextResponse.json({ error: 'Unable to submit attempt' }, { status: 500 });
  }
}
