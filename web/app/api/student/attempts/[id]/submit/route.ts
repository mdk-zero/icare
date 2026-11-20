import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { deriveCompetencyScoresForAttempt } from '@/app/lib/competency';
import { refreshStudentInBackground } from '@/app/lib/ml';
import { isLateSubmission } from '@/app/lib/assessment-timing';
import { acceptedAnswers, matchesShortAnswer, SHORT_ANSWER } from '@/app/lib/short-answer';
import { gradedPaperSize } from '@/app/lib/assessment-selection';
import {
  PRACTICE_STATUS,
  isPracticeRun,
  loadAttemptLimit,
  practiceLive,
} from '@/app/lib/quiz-practice';
import { quizGrade } from '@/app/lib/quiz-attempts';
import {
  ESSAY_MAX_LENGTH,
  isEssay,
  paperPoints,
  scoreCriteria,
  scorePaper,
  type CriterionScore,
} from '@/app/lib/essay';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SubmittedAnswer {
  question_id: string;
  selected_index: number | null;
  /** What the student typed, for a short answer or essay question. */
  answer_text?: string | null;
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
      (a): a is {
        question_id: string;
        selected_index: unknown;
        answer_text?: unknown;
        time_spent_seconds?: unknown;
      } =>
        !!a && typeof a === 'object' && typeof (a as { question_id?: unknown }).question_id === 'string',
    )
    .map((a) => ({
      question_id: a.question_id,
      selected_index:
        a.selected_index === null || a.selected_index === undefined
          ? null
          : Number(a.selected_index),
      // Room for an essay; a short answer is checked against a word or two.
      answer_text: typeof a.answer_text === 'string' ? a.answer_text.slice(0, ESSAY_MAX_LENGTH) : null,
      time_spent_seconds:
        a.time_spent_seconds === undefined ? undefined : Math.max(0, Number(a.time_spent_seconds)),
    }));

  try {
    const supabase = getSupabaseAdmin();

    const { data: attempt } = await supabase
      .from('assessment_attempts')
      .select('id, assessment_id, student_id, assignment_id, status, started_at, score, time_taken_seconds, assessments(time_limit_seconds, max_attempts)')
      .eq('id', attemptId)
      .single();

    if (!attempt || attempt.student_id !== session.uid) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }
    if (
      attempt.status !== 'in_progress' &&
      attempt.status !== 'submitted' &&
      attempt.status !== PRACTICE_STATUS
    ) {
      return NextResponse.json({ error: 'Attempt already closed' }, { status: 409 });
    }
    // A retry of a submit that already went through (the client timed out
    // waiting, or a double-tap): answer with the result again, write nothing.
    const alreadySubmitted = attempt.status !== 'in_progress';
    const quiz = attempt.assessments as unknown as {
      time_limit_seconds: number | null;
      max_attempts: number | null;
    } | null;

    // Past the graded tries this run is a review (083): saved, and it steers
    // the next one, but no grade or average ever reads it. Decided again here
    // rather than trusted from the start, so a try the instructor granted
    // mid-run is graded (unless the paper is too short to be; see below).
    let practice = attempt.status === PRACTICE_STATUS;
    let triesSpent = 0;
    if (!alreadySubmitted) {
      const limit = await loadAttemptLimit(supabase, {
        assessmentId: attempt.assessment_id,
        studentId: session.uid,
        quizMaxAttempts: quiz?.max_attempts ?? null,
        excludeAttemptId: attemptId,
      });
      triesSpent = limit.spent;
      practice = isPracticeRun(limit.spent, limit.maxAttempts) && (await practiceLive(supabase));
    }

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

    // A try granted partway through a review counts from the next run. The
    // short paper in hand holds only questions the student got wrong, so
    // grading it would drag their average down for doing the review.
    if (
      !alreadySubmitted &&
      !practice &&
      triesSpent > 0 &&
      served.length < (await gradedPaperSize(supabase, attempt.assessment_id)) &&
      (await practiceLive(supabase))
    ) {
      practice = true;
    }

    const { data: questionRows, error: qError } = await supabase
      .from('questions')
      .select('id, correct_index, explanation, question_type, options, points')
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

    // Essays (097) are graded by the instructor. One left blank has nothing to
    // read, so it is 0 at once; a written one waits, counting 0 until graded.
    const essays = questions
      .filter((q) => isEssay(q.question_type))
      .map((q) => {
        const text = answerByQuestion.get(q.id)?.answer_text?.trim() ?? '';
        return {
          question_id: q.id,
          criteria_id: q.criteria_id,
          position: q.position,
          answer_text: text,
          max_points: paperPoints(q),
          blank: text.length === 0,
          time_spent_seconds: answerByQuestion.get(q.id)?.time_spent_seconds ?? null,
        };
      });
    const essayIds = new Set(essays.map((e) => e.question_id));

    const graded = questions.filter((q) => !essayIds.has(q.id)).map((q) => {
      const submitted = answerByQuestion.get(q.id);
      if (q.question_type === SHORT_ANSWER) {
        const typed = submitted?.answer_text?.trim() || null;
        const accepted = acceptedAnswers(q.options, q.explanation);
        return {
          question_id: q.id,
          position: q.position,
          selected_index: null,
          correct_index: 0,
          explanation: q.explanation,
          is_correct: matchesShortAnswer(typed, accepted),
          answer_text: typed,
          accepted_answer: accepted[0] ?? null,
          time_spent_seconds: submitted?.time_spent_seconds ?? null,
        };
      }
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
        answer_text: null,
        accepted_answer: null,
        time_spent_seconds: submitted?.time_spent_seconds ?? null,
      };
    });

    const correctCount = graded.filter((g) => g.is_correct).length;
    const correctById = new Map(graded.map((g) => [g.question_id, g.is_correct]));
    // Each checked question is worth 1, as before; an essay its own points.
    const paper = questions.map((q) => {
      const essay = essays.find((e) => e.question_id === q.id);
      return essay
        ? { question_id: q.id, criteria_id: q.criteria_id, max: essay.max_points, earned: 0 }
        : { question_id: q.id, criteria_id: q.criteria_id, max: 1, earned: correctById.get(q.id) ? 1 : 0 };
    });
    const score = scorePaper(paper);
    // A review isn't graded, so its essays don't wait for anyone.
    const hasEssays = essays.length > 0;

    // ---------- weighted criteria scoring ----------
    let criteriaBreakdown: CriterionScore[] = [];

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
      criteriaBreakdown = scoreCriteria(paper, assessmentCriteria, { practice });
    }
    const timeLimit = quiz?.time_limit_seconds;

    // What a review's result is set against: the grade it leaves alone.
    let gradedScore: number | null = null;
    if (practice) {
      const { data: tries } = await supabase
        .from('assessment_attempts')
        .select('score')
        .eq('assessment_id', attempt.assessment_id)
        .eq('student_id', session.uid)
        .eq('status', 'submitted');
      gradedScore = quizGrade((tries ?? []).map((t) => t.score));
    }

    const awaiting = !practice && essays.some((e) => !e.blank);
    const respond = (finalScore: number, timeTaken: number, awaitingGrading = awaiting) =>
      NextResponse.json({
        score: finalScore,
        correct: correctCount,
        total: questions.length,
        // Essays the instructor still has to grade: the score counts them 0 until then.
        awaiting_grading: awaitingGrading,
        time_taken_seconds: timeTaken,
        // Graded and counted either way; a late one is flagged, not refused.
        // A review has no grade to flag.
        late: !practice && isLateSubmission(timeTaken, timeLimit),
        practice,
        ...(practice ? { graded_score: gradedScore } : {}),
        criteria_breakdown: criteriaBreakdown,
        results: [
          ...graded.map((g) => ({
            position: g.position,
            question_id: g.question_id,
            selected_index: g.selected_index,
            correct_index: g.correct_index,
            is_correct: g.is_correct,
            explanation: g.explanation,
            // Short answer only: what was typed, and the answer it was checked against.
            ...(g.accepted_answer !== null
              ? { answer_text: g.answer_text, accepted_answer: g.accepted_answer }
              : {}),
          })),
          // An essay: what was written and what it is worth, graded later.
          ...essays.map((e) => ({
            position: e.position,
            question_id: e.question_id,
            selected_index: null,
            correct_index: 0,
            is_correct: false,
            explanation: '',
            essay: true,
            answer_text: e.answer_text,
            max_points: e.max_points,
            points_awarded: e.blank ? 0 : null,
          })),
        ]
          .sort((a, b) => a.position - b.position)
          .map(({ position: _position, ...rest }) => rest),
      });

    if (alreadySubmitted) {
      return respond(Number(attempt.score ?? score), Number(attempt.time_taken_seconds ?? 0));
    }
    // Essays can only be written once 097 is there, so the column is too.

    const timeTaken = Math.max(
      0,
      Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
    );
    const late = !practice && isLateSubmission(timeTaken, timeLimit);

    // Finalizing the attempt is what claims the submission: one conditional
    // UPDATE, so when a double-tap or a retry races this request exactly one
    // of them moves it out of in_progress. It goes first so a failure in the
    // writes below can never leave an attempt that can't be submitted again.
    const { data: finalized, error: attemptError } = await supabase
      .from('assessment_attempts')
      .update({
        status: practice ? PRACTICE_STATUS : 'submitted',
        submitted_at: new Date().toISOString(),
        score,
        time_taken_seconds: timeTaken,
        ...(hasEssays ? { awaiting_grading: awaiting } : {}),
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
    // are detail for review, and what the next paper is chosen from — review
    // quizzes included. A failure here is logged, not surfaced — the backfill
    // scripts can rebuild the breakdown.
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

    // The essays, for the instructor to grade. A blank one is graded 0 now,
    // and reads as a wrong answer like any other.
    if (hasEssays) {
      const now = new Date().toISOString();
      const { error: essaysError } = await supabase.from('essay_answers').insert(
        essays.map((e) => ({
          attempt_id: attemptId,
          question_id: e.question_id,
          answer_text: e.answer_text,
          max_points: e.max_points,
          ...(e.blank ? { points_awarded: 0, graded_at: now } : {}),
        })),
      );
      if (essaysError) console.error('Failed to save essays for attempt', attemptId, essaysError);
      const blank = essays.filter((e) => e.blank);
      if (blank.length > 0) {
        const { error: blankError } = await supabase.from('attempt_answers').insert(
          blank.map((e) => ({
            attempt_id: attemptId,
            question_id: e.question_id,
            selected_index: null,
            is_correct: false,
            time_spent_seconds: e.time_spent_seconds,
          })),
        );
        if (blankError) console.error('Failed to save blank essays for attempt', attemptId, blankError);
      }
    }

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

    // Roll the breakdown up into per-competency standing (after the last essay
    // is graded, when there are essays to grade). Only the request
    // that finalized the attempt gets here, so it runs once. Awaited so the
    // scores exist by the time the student sees their results, but never
    // allowed to fail the submission; the backfill can recover a missed one.
    // Not for a review: a re-run of questions already seen with their answers
    // would lift the standing without showing anything new.
    if (!practice && !awaiting && criteriaBreakdown.length > 0) {
      try {
        await deriveCompetencyScoresForAttempt(supabase, attemptId);
      } catch (err) {
        console.error('Competency derivation failed for attempt', attemptId, err);
      }
    }

    if (!practice && attempt.assignment_id) {
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
          practice,
          ...(hasEssays ? { essays: essays.length, awaiting_grading: awaiting } : {}),
        },
      },
      request,
    );

    // A graded result moves the ML's picture of the student, so re-score them
    // after the response goes out. Review quizzes don't reach its features.
    // An essay still to grade holds that back until the instructor grades it.
    if (!practice && !awaiting) refreshStudentInBackground(session.uid);

    return respond(score, timeTaken);
  } catch (err) {
    console.error('Submit attempt failed', err);
    return NextResponse.json({ error: 'Unable to submit attempt' }, { status: 500 });
  }
}
