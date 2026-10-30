import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  selectQuestionsForAttempt,
  loadServedQuestions,
  SelectionError,
} from '@/app/lib/assessment-selection';
import { quizInDeanScope } from '@/app/lib/assessment-access';
import {
  PRACTICE_STATUS,
  isPracticeRun,
  loadAttemptLimit,
  practiceLive,
} from '@/app/lib/quiz-practice';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Slack past the time limit before an open attempt counts as abandoned: the
 * app auto-submits at zero, and that submit may still be on its way.
 */
const EXPIRY_GRACE_MS = 2 * 60 * 1000;

/**
 * Start — or resume — an attempt.
 *
 * Resuming matters more than it looks. The mobile quiz screen starts an attempt
 * from a mount effect, so opening the screen and backing out used to create a
 * fresh row every time; that is where the abandoned attempts in the database
 * came from. Once a retry limit exists that behaviour would charge a student
 * for a quiz they never sat, so an unfinished attempt is handed back with the
 * exact paper it was already served rather than replaced.
 *
 * Past the limit the quiz no longer closes: the next run is practice (083),
 * dealt the same adaptive way but never graded. Before 083 is applied it
 * closes as it always did.
 *
 * Questions come back without correct_index or explanation — grading is
 * server-side, in the submit route.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assessmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, title, is_published, time_limit_seconds, max_attempts')
      .eq('id', assessmentId)
      .single();
    if (!assessment || !assessment.is_published) {
      return NextResponse.json({ error: 'Assessment not available' }, { status: 404 });
    }

    const limit = await loadAttemptLimit(supabase, {
      assessmentId,
      studentId: session.uid,
      quizMaxAttempts: assessment.max_attempts ?? null,
    });
    const { assignment, maxAttempts } = limit;
    // Unless it was given to them, only a quiz of their own Dean's (077).
    if (!assignment && !(await quizInDeanScope(supabase, session, assessmentId))) {
      return NextResponse.json({ error: 'Assessment not available' }, { status: 404 });
    }
    let spent = limit.spent;
    // Past the graded tries, and 083 applied: whatever runs next is practice.
    const practiceNow = async () =>
      isPracticeRun(spent, maxAttempts) && (await practiceLive(supabase));

    // ---------- resume ----------
    let { data: open } = await supabase
      .from('assessment_attempts')
      .select('id, started_at')
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // An attempt left open past its time limit (the app was closed, the phone
    // died) has run out: handing it back would only put the student straight
    // into "time's up". Close it as expired — it counts as a try, like any
    // attempt that ran its course — and deal a fresh one below. A practice run
    // left that way is deleted instead, so it never spends a graded try.
    let previousExpired = false;
    if (open && assessment.time_limit_seconds) {
      const elapsedMs = Date.now() - new Date(open.started_at).getTime();
      if (elapsedMs > assessment.time_limit_seconds * 1000 + EXPIRY_GRACE_MS) {
        const wasPractice = await practiceNow();
        const { error: expireError } = wasPractice
          ? await supabase
              .from('assessment_attempts')
              .delete()
              .eq('id', open.id)
              .eq('status', 'in_progress')
          : await supabase
              .from('assessment_attempts')
              .update({ status: 'expired' })
              .eq('id', open.id)
              .eq('status', 'in_progress');
        if (expireError) {
          console.error('Failed to expire a timed-out attempt', expireError);
          return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
        }
        open = null;
        if (!wasPractice) spent += 1;
        previousExpired = true;
      }
    }

    const practice = await practiceNow();
    let practiceNumber: number | null = null;
    if (practice) {
      const { count: practiced } = await supabase
        .from('assessment_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', assessmentId)
        .eq('student_id', session.uid)
        .eq('status', PRACTICE_STATUS);
      practiceNumber = (practiced ?? 0) + 1;
    }

    const meta = {
      max_attempts: maxAttempts,
      attempts_used: spent,
      attempts_remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - spent),
      previous_expired: previousExpired,
      practice,
      // A practice run is numbered on its own; "Attempt 3 of 2" would read wrong.
      ...(practice ? { practice_number: practiceNumber } : { attempt_number: spent + 1 }),
    };

    if (open) {
      const served = await loadServedQuestions(supabase, open.id);
      if (served.length > 0) {
        return NextResponse.json({
          attempt: { id: open.id, started_at: open.started_at },
          assessment: {
            id: assessment.id,
            title: assessment.title,
            time_limit_seconds: assessment.time_limit_seconds,
          },
          questions: served.map((q) => ({
            id: q.id,
            position: q.position,
            content: q.content,
            options: q.options,
            question_type: q.question_type,
          })),
          resumed: true,
          ...meta,
        });
      }
      // An in_progress attempt with no paper predates the served set (or its
      // write failed). Deal it one below and keep the row, rather than opening
      // a second attempt alongside it.
    }

    // ---------- limit ----------
    if (maxAttempts !== null && spent >= maxAttempts && !practice) {
      return NextResponse.json(
        {
          error:
            `You have used all ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'} ` +
            `for this quiz. Ask your instructor if you need another.`,
          ...meta,
        },
        { status: 409 },
      );
    }

    // ---------- deal a paper ----------
    let selection;
    try {
      selection = await selectQuestionsForAttempt(supabase, {
        assessmentId,
        studentId: session.uid,
      });
    } catch (err) {
      if (err instanceof SelectionError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    let attemptId = open?.id ?? null;
    let startedAt = open?.started_at ?? null;

    if (!attemptId) {
      const { data: created, error } = await supabase
        .from('assessment_attempts')
        .insert({
          assessment_id: assessmentId,
          student_id: session.uid,
          assignment_id: assignment?.id ?? null,
        })
        .select('id, started_at')
        .single();

      if (error || !created) {
        console.error('Failed to start attempt', error);
        return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
      }
      attemptId = created.id;
      startedAt = created.started_at;
    }

    const { error: servedError } = await supabase.from('attempt_questions').insert(
      selection.questions.map((q) => ({
        attempt_id: attemptId,
        question_id: q.id,
        criteria_id: q.criteria_id,
        position: q.position,
      })),
    );

    if (servedError) {
      console.error('Failed to record served questions', servedError);
      // An attempt with no paper cannot be graded against one, so don't leave a
      // half-built row behind for the resume path to find.
      if (!open) await supabase.from('assessment_attempts').delete().eq('id', attemptId);
      return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
    }

    if (!practice && assignment && assignment.status === 'pending') {
      await supabase
        .from('assessment_assignments')
        .update({ status: 'in_progress' })
        .eq('id', assignment.id);
    }

    await logAudit(
      session,
      {
        action: 'quiz.start',
        entityType: 'assessment_attempts',
        entityId: attemptId,
        details: {
          assessment_id: assessmentId,
          questions: selection.questions.length,
          attempt_number: selection.attemptNumber,
          practice,
        },
      },
      request,
    );

    return NextResponse.json(
      {
        attempt: { id: attemptId, started_at: startedAt },
        assessment: {
          id: assessment.id,
          title: assessment.title,
          time_limit_seconds: assessment.time_limit_seconds,
        },
        questions: selection.questions.map((q) => ({
          id: q.id,
          position: q.position,
          content: q.content,
          options: q.options,
          question_type: q.question_type,
        })),
        resumed: false,
        ...meta,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Start attempt failed', err);
    return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
  }
}
