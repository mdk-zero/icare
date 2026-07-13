import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Admin student detail: profile plus submitted assessment-attempt history. */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: student, error } = await supabase
      .from('users')
      .select('id, email, name, picture_url, created_at, last_login_at')
      .eq('id', id)
      .eq('role', 'student')
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch student', error);
      return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
    }
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const { data: attempts } = await supabase
      .from('assessment_attempts')
      .select('id, score, submitted_at, time_taken_seconds, assessments(title)')
      .eq('student_id', id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(50);

    const attemptRows = (attempts ?? []).map((a) => ({
      id: a.id,
      quiz_title:
        (a.assessments as unknown as { title?: string } | null)?.title ?? 'Assessment',
      score: a.score !== null ? Math.round(Number(a.score)) : null,
      submitted_at: a.submitted_at,
      time_taken_seconds: a.time_taken_seconds,
    }));

    const scored = attemptRows.filter((a) => a.score !== null);
    const averageScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length)
        : null;

    return NextResponse.json({
      student: {
        ...student,
        quizzes_completed: attemptRows.length,
        average_score: averageScore,
      },
      attempts: attemptRows,
    });
  } catch (err) {
    console.error('Fetch student detail failed', err);
    return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
  }
}
