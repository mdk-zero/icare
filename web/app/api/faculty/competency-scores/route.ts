import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const studentId = request.nextUrl.searchParams.get('student_id');
  if (!studentId) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: scores, error } = await supabase
      .from('competency_scores')
      .select('id, competency_id, faculty_id, source, score, attempt_id, remarks, created_at, competency_areas(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Failed to fetch competency scores', error);
      return NextResponse.json({ error: 'Unable to fetch scores' }, { status: 500 });
    }

    return NextResponse.json({ scores: scores ?? [] });
  } catch (err) {
    console.error('Fetch competency scores failed', err);
    return NextResponse.json({ error: 'Unable to fetch scores' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_id, competency_id, score, remarks, attempt_id } = body as Record<string, unknown>;

  if (typeof student_id !== 'string' || student_id.length === 0) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }
  if (typeof competency_id !== 'string' || competency_id.length === 0) {
    return NextResponse.json({ error: 'competency_id is required' }, { status: 400 });
  }
  const scoreValue = Number(score);
  if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
    return NextResponse.json({ error: 'Score must be between 0 and 100' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: student }, { data: competency }] = await Promise.all([
      supabase.from('users').select('id, name').eq('id', student_id).eq('role', 'student').single(),
      supabase.from('competency_areas').select('id, name').eq('id', competency_id).single(),
    ]);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    if (!competency) return NextResponse.json({ error: 'Competency not found' }, { status: 404 });

    const { data: record, error } = await supabase
      .from('competency_scores')
      .insert({
        student_id,
        competency_id,
        faculty_id: session.uid,
        source: 'faculty_validation',
        score: scoreValue,
        attempt_id: typeof attempt_id === 'string' && attempt_id ? attempt_id : null,
        remarks: typeof remarks === 'string' && remarks.trim() ? remarks.trim() : null,
      })
      .select('id, competency_id, source, score, remarks, created_at')
      .single();

    if (error || !record) {
      console.error('Failed to record competency score', error);
      return NextResponse.json({ error: 'Unable to record score' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'competency.validate',
        entityType: 'competency_scores',
        entityId: record.id,
        details: { student_id, competency: competency.name, score: scoreValue },
      },
      request,
    );

    const { error: notifyError } = await supabase.from('notifications').insert({
      user_id: student_id,
      type: 'performance_validated',
      title: 'Competency score recorded',
      body: `Your instructor rated your "${competency.name}" competency at ${scoreValue}%.`,
      data: { competency_id, score: scoreValue },
    });
    if (notifyError) console.error('Failed to create validation notification', notifyError);

    return NextResponse.json({ score: record }, { status: 201 });
  } catch (err) {
    console.error('Record competency score failed', err);
    return NextResponse.json({ error: 'Unable to record score' }, { status: 500 });
  }
}
