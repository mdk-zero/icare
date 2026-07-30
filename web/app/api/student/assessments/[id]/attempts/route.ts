import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  selectQuestionsForAttempt,
  loadServedQuestions,
  SelectionError,
} from '@/app/lib/assessment-selection';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Attempts that have run their course. An in_progress attempt is still the current one. */
const SPENT_STATUSES = ['submitted', 'expired'];

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

    const { data: assignment } = await supabase
      .from('assessment_assignments')
      .select('id, status, max_attempts')
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .maybeSingle();

    // A per-student override beats the assessment default; null at both levels
    // means unlimited.
    const maxAttempts = assignment?.max_attempts ?? assessment.max_attempts ?? null;

    const { count: spentCount } = await supabase
      .from('assessment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .in('status', SPENT_STATUSES);
    const spent = spentCount ?? 0;

    const meta = {
      max_attempts: maxAttempts,
      attempts_used: spent,
      attempts_remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - spent),
    };

    // ---------- resume ----------
    const { data: open } = await supabase
      .from('assessment_attempts')
      .select('id, started_at')
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
          })),
          resumed: true,
          attempt_number: spent + 1,
          ...meta,
        });
      }
      // An in_progress attempt with no paper predates the served set (or its
      // write failed). Deal it one below and keep the row, rather than opening
      // a second attempt alongside it.
    }

    // ---------- limit ----------
    if (maxAttempts !== null && spent >= maxAttempts) {
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

    if (assignment && assignment.status === 'pending') {
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
        })),
        resumed: false,
        attempt_number: selection.attemptNumber,
        ...meta,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Start attempt failed', err);
    return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
  }
}
