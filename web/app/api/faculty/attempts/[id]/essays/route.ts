import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { quizInDeanScope } from '@/app/lib/assessment-access';
import { logAudit } from '@/app/lib/audit';
import { insertNotifications } from '@/app/lib/notify';
import { ESSAY_FEEDBACK_MAX_LENGTH, validEssayPoints } from '@/app/lib/essay';
import {
  ESSAYS_NEED_MIGRATION,
  isMissingEssayTable,
  regradeAttempt,
  type EssayAnswerRow,
} from '@/app/lib/essay-grading';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST { grades: [{ question_id, points, feedback? }] }: grade essays (097)
 * on one attempt. Points are whole numbers from 0 to what the essay is worth;
 * a grade can be changed later. The attempt is scored again each time, and
 * the student is told once the last essay on it is graded.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: attemptId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = (body as { grades?: unknown })?.grades;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'Send at least one grade' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: attempt } = await supabase
      .from('assessment_attempts')
      .select('id, assessment_id, student_id, status, awaiting_grading, assessments(title)')
      .eq('id', attemptId)
      .maybeSingle();
    if (
      !attempt ||
      attempt.status !== 'submitted' ||
      !(await canSeeStudent(supabase, session, attempt.student_id as string)) ||
      !(await quizInDeanScope(supabase, session, attempt.assessment_id as string))
    ) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    const { data: essays, error: essaysError } = await supabase
      .from('essay_answers')
      .select('id, question_id, max_points, points_awarded')
      .eq('attempt_id', attemptId);
    if (essaysError) {
      if (isMissingEssayTable(essaysError)) return NextResponse.json({ error: ESSAYS_NEED_MIGRATION }, { status: 409 });
      throw essaysError;
    }
    const essayByQuestion = new Map(
      ((essays ?? []) as Pick<EssayAnswerRow, 'id' | 'question_id' | 'max_points' | 'points_awarded'>[]).map((e) => [e.question_id, e]),
    );

    const now = new Date().toISOString();
    const updates: { id: string; points: number; feedback: string | null }[] = [];
    for (const g of raw) {
      const questionId = (g as { question_id?: unknown })?.question_id;
      const essay = typeof questionId === 'string' ? essayByQuestion.get(questionId) : undefined;
      if (!essay) return NextResponse.json({ error: 'That essay is not on this attempt' }, { status: 400 });
      const points = validEssayPoints((g as { points?: unknown }).points, essay.max_points);
      if (points === null) {
        return NextResponse.json(
          { error: `Give a whole number of points from 0 to ${essay.max_points}` },
          { status: 400 },
        );
      }
      const rawFeedback = (g as { feedback?: unknown }).feedback;
      const feedback = typeof rawFeedback === 'string' && rawFeedback.trim() ? rawFeedback.trim().slice(0, ESSAY_FEEDBACK_MAX_LENGTH) : null;
      updates.push({ id: essay.id, points, feedback });
    }

    for (const u of updates) {
      const { error } = await supabase
        .from('essay_answers')
        .update({ points_awarded: u.points, feedback: u.feedback, graded_by: session.uid, graded_at: now })
        .eq('id', u.id);
      if (error) throw error;
    }

    const wasAwaiting = Boolean(attempt.awaiting_grading);
    const regraded = await regradeAttempt(supabase, attemptId);
    if (!regraded) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });

    const title = (attempt.assessments as unknown as { title?: string } | null)?.title ?? 'your quiz';
    if (wasAwaiting && !regraded.awaiting) {
      const { error: notifyError } = await insertNotifications(supabase, {
        user_id: attempt.student_id as string,
        type: 'quiz_graded',
        title: 'Your essay is graded',
        body: `${title}: your score is now ${Math.round(regraded.score)}%.`,
        data: { assessment_id: attempt.assessment_id, attempt_id: attemptId },
      });
      if (notifyError) console.error('Failed to notify the student of the essay grade', notifyError);
    }

    await logAudit(
      session,
      {
        action: 'quiz.grade_essays',
        entityType: 'assessment_attempts',
        entityId: attemptId,
        details: {
          message: `Graded ${updates.length} essay${updates.length === 1 ? '' : 's'} on “${title}”`,
          assessment_id: attempt.assessment_id,
          student_id: attempt.student_id,
          score: regraded.score,
          awaiting_grading: regraded.awaiting,
        },
      },
      request,
    );

    return NextResponse.json({ score: regraded.score, awaiting_grading: regraded.awaiting });
  } catch (err) {
    console.error('Grade essays failed', err);
    return NextResponse.json({ error: 'Unable to save the grades' }, { status: 500 });
  }
}
