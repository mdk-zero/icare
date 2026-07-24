import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
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
      .select('id, email, name, role, picture_url, section_id, sections(id, name)')
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

    // Faculty can only view students in their sections.
    if (session.role === 'faculty') {
      const allowed = await isStudentInFacultySections(supabase, session.uid, id);
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // The profile header shows a score, a quiz count and a last-seen time, so
    // the row has to carry them — they were previously read off a mock.
    const [risks, activity, attempts] = await Promise.all([
      getLatestRiskByStudent(supabase, [id]),
      getLastActivityByStudent(supabase, [id]),
      supabase
        .from('assessment_attempts')
        .select('score')
        .eq('student_id', id)
        .eq('status', 'submitted'),
    ]);

    const scores = (attempts.data ?? [])
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
    });
  } catch (err) {
    console.error('Fetch student detail failed', err);
    return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
  }
}
