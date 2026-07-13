import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * Student's own performance history (mobile Progress screen): submitted
 * quiz attempts and faculty-validated competency scores.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: attempts, error: attemptsError }, { data: scores, error: scoresError }] =
      await Promise.all([
        supabase
          .from('assessment_attempts')
          .select('id, score, submitted_at, time_taken_seconds, assessments(title, category)')
          .eq('student_id', session.uid)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })
          .limit(50),
        supabase
          .from('competency_scores')
          .select('id, competency_id, score, source, remarks, created_at, competency_areas(name)')
          .eq('student_id', session.uid)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

    if (attemptsError || scoresError) {
      console.error('Failed to fetch progress', attemptsError ?? scoresError);
      return NextResponse.json({ error: 'Unable to fetch progress' }, { status: 500 });
    }

    return NextResponse.json({
      attempts: attempts ?? [],
      competency_scores: scores ?? [],
    });
  } catch (err) {
    console.error('Fetch progress failed', err);
    return NextResponse.json({ error: 'Unable to fetch progress' }, { status: 500 });
  }
}
