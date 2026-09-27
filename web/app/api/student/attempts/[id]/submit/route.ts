import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { deriveCompetencyScoresForAttempt } from '@/app/lib/competency';
import { isLateSubmission } from '@/app/lib/assessment-timing';

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
      .select('id, assessment_id, student_id, assignment_id, status, started_at, score, time_taken_seconds, assessments(time_limit_seconds)')
      .eq('id', attemptId)
      .single();

    if (!attempt || attempt.student_id !== session.uid) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }
    if (attempt.status !== 'in_progress' && attempt.status !== 'submitted') {
      return NextResponse.json({ error: 'Attempt already closed' }, { status: 409 });
    }
    // A retry of a submit that already went through (the client timed out
    // waiting, or a double-tap): answer with the result again, write nothing.
    const alreadySubmitted = attempt.status === 'submitted';

    // Grade against the paper this attempt was actually served, not the whole
    // bank: a 20-question paper drawn from a 50-question bank would otherwise
    // cap the student at 40%.
    const { data: servedRows } = await supabase
      .from('attempt_questions')
      .select('question_id, criteria_id, position')
      .eq('attempt_id', attemptId)
      .order('position', { ascending: true });

    let served: { question_id: string; criteria_id: string | null; position: number }[];
    if (servedRows && servedRows.length > 0) {
      served = servedRows;
    } else {
      // Attempts that predate the served set were handed the entire bank.
      const { data: bank } = await supabase
        .from('questions')
        .select('id, criteria_id, position')
        .eq('assessment_id', attempt.assessment_id)
        .order('position', { ascending: true });
      served = (bank ?? []).map((q) => ({
        question_id: q.id,
        criteria_id: q.criteria_id,
        position: q.position,
      }));
    }

    if (served.length === 0) {
      return NextResponse.json({ error: 'Unable to grade attempt' }, { status: 500 });
    }

    const { data: questionRows, error: qError } = await supabase
      .from('questions')
      .select('id, correct_index, explanation')
      .in(
        'id',
        served.map((s) => s.question_id),
      );

    if (qError || !questionRows || questionRows.length === 0) {
      return NextResponse.json({ error: 'Unable to grade attempt' }, { status: 500 });
    }

    const questionById = new Map(questionRows.map((q) => [q.id, q]));
    const questions = served
      .map((s) => {
        const q = questionById.get(s.question_id);
        return q ? { ...q, position: s.position, criteria_id: s.criteria_id } : null;
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

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

    // ---------- weighted criteria scoring ----------
    let criteriaBreakdown: {
      criteria_id: string;
      criteria_name: string;
      weight: number;
      correct: number;
      total: number;
      score: number;
      weighted_score: number;
    }[] = [];

    // Criteria own their questions outright now. Matching on a shared
    // competency, as this used to, let a question tagged with two competencies
    // count toward every criterion sharing them — one assessment had three
    // criteria all scoring against all ten questions.
    const { data: criteriaRows } = await supabase
      .from('assessment_criteria')
      .select('id, name, weight, competency_id')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order', { ascending: true });

    const assessmentCriteria = criteriaRows ?? [];

    if (assessmentCriteria.length > 0) {
      const correctByQuestion = new Map(graded.map((g) => [g.question_id, g.is_correct]));

      criteriaBreakdown = assessmentCriteria.map((c) => {
        const mine = served.filter((s) => s.criteria_id === c.id);
        const total = mine.length;
        const correct = mine.filter((s) => correctByQuestion.get(s.question_id)).length;
        const pct = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

        return {
          criteria_id: c.id,
          criteria_name: c.name,
          weight: c.weight,
          correct,
          total,
          score: pct,
          weighted_score: Math.round(pct * (c.weight / 100) * 100) / 100,
        };
      });

    }
    const timeLimit = (attempt.assessments as unknown as { time_limit_seconds: number | null } | null)
      ?.time_limit_seconds;
    const respond = (finalScore: number, timeTaken: number) =>
      NextResponse.json({
        score: finalScore,
        correct: correctCount,
        total: questions.length,
        time_taken_seconds: timeTaken,
        // Graded and counted either way; a late one is flagged, not refused.
        late: isLateSubmission(timeTaken, timeLimit),
        criteria_breakdown: criteriaBreakdown,
        results: [...graded]
          .sort((a, b) => a.position - b.position)
          .map((g) => ({
            question_id: g.question_id,
            selected_index: g.selected_index,
            correct_index: g.correct_index,
            is_correct: g.is_correct,
            explanation: g.explanation,
          })),
      });

    if (alreadySubmitted) {
      return respond(Number(attempt.score ?? score), Number(attempt.time_taken_seconds ?? 0));
    }

    const timeTaken = Math.max(
      0,
      Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
    );
    const late = isLateSubmission(timeTaken, timeLimit);

    // Finalizing the attempt is what claims the submission: one conditional
    // UPDATE, so when a double-tap or a retry races this request exactly one
    // of them moves it out of in_progress. It goes first so a failure in the
    // writes below can never leave an attempt that can't be submitted again.
    const { data: finalized, error: attemptError } = await supabase
      .from('assessment_attempts')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        score,
        time_taken_seconds: timeTaken,
      })
      .eq('id', attemptId)
      .eq('status', 'in_progress')
      .select('id');
    if (attemptError) {
      console.error('Failed to finalize attempt', attemptError);
      return NextResponse.json({ error: 'Unable to finalize attempt' }, { status: 500 });
    }
    if (!finalized || finalized.length === 0) {
      // The other request won; it is saving the same result.
      return respond(score, timeTaken);
    }

    // The score is saved; the per-question answers and the criteria breakdown
    // are detail for review. A failure here is logged, not surfaced — the
    // backfill scripts can rebuild the breakdown.
    const { error: answersError } = await supabase.from('attempt_answers').insert(
      graded.map((g) => ({
        attempt_id: attemptId,
        question_id: g.question_id,
        selected_index: g.selected_index,
        is_correct: g.is_correct,
        time_spent_seconds: g.time_spent_seconds,
      })),
    );
    if (answersError) console.error('Failed to save answers for attempt', attemptId, answersError);

    if (criteriaBreakdown.length > 0) {
      const { error: criteriaError } = await supabase.from('attempt_criteria_scores').insert(
        criteriaBreakdown.map((cb) => ({
          attempt_id: attemptId,
          criteria_id: cb.criteria_id,
          competency_id: assessmentCriteria.find((c) => c.id === cb.criteria_id)?.competency_id ?? '',
          criteria_name: cb.criteria_name,
          weight: cb.weight,
          correct: cb.correct,
          total: cb.total,
          score: cb.score,
          weighted_score: cb.weighted_score,
        })),
      );
      if (criteriaError) console.error('Failed to save criteria scores for attempt', attemptId, criteriaError);
    }

    // Roll the breakdown up into per-competency standing. Only the request
    // that finalized the attempt gets here, so it runs once. Awaited so the
    // scores exist by the time the student sees their results, but never
    // allowed to fail the submission; the backfill can recover a missed one.
    if (criteriaBreakdown.length > 0) {
      try {
        await deriveCompetencyScoresForAttempt(supabase, attemptId);
      } catch (err) {
        console.error('Competency derivation failed for attempt', attemptId, err);
      }
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
          late,
        },
      },
      request,
    );

    return respond(score, timeTaken);
  } catch (err) {
    console.error('Submit attempt failed', err);
    return NextResponse.json({ error: 'Unable to submit attempt' }, { status: 500 });
  }
}
