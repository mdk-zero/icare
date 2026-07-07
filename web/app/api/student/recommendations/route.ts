import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * "Recommended for you" (Phase 3.6/3.8): the student's open
 * learning_recommendations written by the ML service, joined with the
 * quiz metadata the rail displays.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('learning_recommendations')
      .select('id, assessment_id, rank, reason, created_at, assessments(id, title, description, difficulty, category), competency_areas(name)')
      .eq('student_id', session.uid)
      .is('dismissed_at', null)
      .is('completed_at', null)
      .order('rank', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Failed to fetch recommendations', error);
      return NextResponse.json({ error: 'Unable to fetch recommendations' }, { status: 500 });
    }

    return NextResponse.json({ recommendations: data ?? [] });
  } catch (err) {
    console.error('Fetch recommendations failed', err);
    return NextResponse.json({ error: 'Unable to fetch recommendations' }, { status: 500 });
  }
}

/** Dismiss one of your own recommendations. */
export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('learning_recommendations')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('student_id', session.uid);

    if (error) {
      console.error('Failed to dismiss recommendation', error);
      return NextResponse.json({ error: 'Unable to dismiss recommendation' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Dismiss recommendation failed', err);
    return NextResponse.json({ error: 'Unable to dismiss recommendation' }, { status: 500 });
  }
}
