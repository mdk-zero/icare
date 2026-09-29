import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/assessments/:id/flashcards
// The questions a student has already been asked on this quiz, as study cards:
// the question on the front, the right answer (and why) on the back. Only
// after a submitted attempt, so the cards can't be used to see the answers
// before sitting the quiz; and only the questions from the student's own
// papers, not the rest of the bank still held back for later attempts.
export async function GET(_request: Request, { params }: RouteParams) {
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
      .select('id, title')
      .eq('id', assessmentId)
      .maybeSingle();
    if (!assessment) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

    const { data: attempts, error: attemptsError } = await supabase
      .from('assessment_attempts')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .eq('status', 'submitted');
    if (attemptsError) throw attemptsError;
    if (!attempts?.length) {
      return NextResponse.json(
        { error: 'Finish this quiz first — flashcards open once you have submitted it.' },
        { status: 403 },
      );
    }

    const { data: served, error: servedError } = await supabase
      .from('attempt_questions')
      .select('question_id, position')
      .in(
        'attempt_id',
        attempts.map((a) => a.id),
      );
    if (servedError) throw servedError;

    // Attempts from before papers were recorded were handed the whole bank.
    let questionQuery = supabase
      .from('questions')
      .select('id, content, options, correct_index, explanation, position')
      .eq('assessment_id', assessmentId)
      .order('position', { ascending: true });
    if (served && served.length > 0) {
      questionQuery = questionQuery.in('id', [...new Set(served.map((s) => s.question_id))]);
    }
    const { data: questions, error: questionsError } = await questionQuery;
    if (questionsError) throw questionsError;

    const cards = (questions ?? []).flatMap((q) => {
      const options = Array.isArray(q.options) ? (q.options as unknown[]) : [];
      const answer = options[q.correct_index as number];
      if (typeof q.content !== 'string' || typeof answer !== 'string') return [];
      return [
        {
          id: q.id as string,
          question: q.content,
          answer,
          explanation: typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation : null,
        },
      ];
    });

    return NextResponse.json({ title: assessment.title, cards });
  } catch (err) {
    console.error('Fetch flashcards failed', err);
    return NextResponse.json({ error: 'Unable to load flashcards' }, { status: 500 });
  }
}
