import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Start an attempt: creates an in_progress attempt row and returns the
// questions WITHOUT correct_index/explanation (grading is server-side).
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
      .select('id, title, is_published, time_limit_seconds')
      .eq('id', assessmentId)
      .single();
    if (!assessment || !assessment.is_published) {
      return NextResponse.json({ error: 'Assessment not available' }, { status: 404 });
    }

    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id, position, content, options')
      .eq('assessment_id', assessmentId)
      .order('position', { ascending: true });

    if (qError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'Assessment has no questions' }, { status: 400 });
    }

    const { data: assignment } = await supabase
      .from('assessment_assignments')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .eq('student_id', session.uid)
      .maybeSingle();

    const { data: attempt, error } = await supabase
      .from('assessment_attempts')
      .insert({
        assessment_id: assessmentId,
        student_id: session.uid,
        assignment_id: assignment?.id ?? null,
      })
      .select()
      .single();

    if (error || !attempt) {
      console.error('Failed to start attempt', error);
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
        entityId: attempt.id,
        details: { assessment_id: assessmentId },
      },
      request,
    );

    return NextResponse.json(
      {
        attempt: { id: attempt.id, started_at: attempt.started_at },
        assessment: {
          id: assessment.id,
          title: assessment.title,
          time_limit_seconds: assessment.time_limit_seconds,
        },
        questions: questions.map((q) => ({
          id: q.id,
          position: q.position,
          content: q.content,
          options: Array.isArray(q.options) ? q.options : [],
        })),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Start attempt failed', err);
    return NextResponse.json({ error: 'Unable to start attempt' }, { status: 500 });
  }
}
