import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { isStudentInFacultySections } from '@/app/lib/roster';
import { getLatestRiskByStudent, getLastActivityByStudent } from '@/app/lib/faculty-dashboard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: student, error } = await supabase
      .from('users')
      .select('id, email, name, role, picture_url, sex, section_id, sections(id, name)')
      .eq('id', id)
      .eq('role', 'student')
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch student detail', error);
      return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
    }

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Faculty only their group members; an admin only their own students.
    if (!(await canSeeStudent(supabase, session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // The profile header shows a score, a quiz count and a last-seen time, and
    // the Performance tab lists the attempts themselves, so the response has to
    // carry both — they were previously read off a mock.
    const [risks, activity, attempts] = await Promise.all([
      getLatestRiskByStudent(supabase, [id]),
      getLastActivityByStudent(supabase, [id]),
      supabase
        .from('assessment_attempts')
        .select('id, score, submitted_at, started_at, time_taken_seconds, assessments(title)')
        .eq('student_id', id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(50),
    ]);

    if (attempts.error) {
      console.error('Failed to fetch student attempts', attempts.error);
      return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
    }

    const attemptRows = attempts.data ?? [];

    // How many questions each attempt got right, for the per-attempt breakdown.
    // The denominator is the number served, which an adaptive assessment varies
    // from attempt to attempt, so it is counted per attempt rather than read off
    // the assessment.
    const answerCounts = new Map<string, { correct: number; total: number }>();
    if (attemptRows.length > 0) {
      const { data: answers, error: answersError } = await supabase
        .from('attempt_answers')
        .select('attempt_id, is_correct')
        .in(
          'attempt_id',
          attemptRows.map((a) => a.id as string),
        );
      if (answersError) {
        // Supporting detail — the scores themselves are still worth showing.
        console.error('Failed to fetch attempt answers', answersError);
      }
      for (const answer of answers ?? []) {
        const entry = answerCounts.get(answer.attempt_id as string) ?? { correct: 0, total: 0 };
        entry.total += 1;
        if (answer.is_correct) entry.correct += 1;
        answerCounts.set(answer.attempt_id as string, entry);
      }
    }

    const performanceHistory = attemptRows.map((a) => {
      const counts = answerCounts.get(a.id as string) ?? null;
      return {
        id: a.id,
        quiz_title: (a.assessments as unknown as { title?: string } | null)?.title ?? 'Assessment',
        score: a.score == null ? null : Math.round(Number(a.score)),
        submitted_at: a.submitted_at,
        started_at: a.started_at,
        time_taken_seconds: a.time_taken_seconds,
        correct_answers: counts?.correct ?? null,
        total_questions: counts?.total ?? null,
      };
    });

    const scores = attemptRows
      .map((a) => (a.score == null ? null : Number(a.score)))
      .filter((s): s is number => s != null);
    const averageScore = scores.length
      ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
      : null;

    const { sections, ...rest } = student;
    const section = sections as unknown as { id: string; name: string } | null;
    return NextResponse.json({
      student: {
        ...rest,
        section: section?.name ?? null,
        risk_level: risks.get(id)?.risk ?? null,
        last_activity: activity.get(id) ?? null,
        average_score: averageScore,
        quiz_count: scores.length,
      },
      performance_history: performanceHistory,
    });
  } catch (err) {
    console.error('Fetch student detail failed', err);
    return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
  }
}
