import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { score, time_taken } = body as { score?: unknown; time_taken?: unknown };

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return NextResponse.json({ error: 'score must be a number between 0 and 100' }, { status: 400 });
  }

  if (typeof time_taken !== 'number' || time_taken < 0) {
    return NextResponse.json({ error: 'time_taken must be a non-negative number' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: assignment, error: fetchError } = await supabase
      .from('scenario_assignments')
      .select('id, student_id, scenario_id')
      .eq('id', assignmentId)
      .maybeSingle();

    if (fetchError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    if (assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updated, error } = await supabase
      .from('scenario_assignments')
      .update({
        status: 'completed',
        score,
        time_taken,
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken')
      .single();

    if (error || !updated) {
      console.error('Failed to complete assignment', error);
      return NextResponse.json({ error: 'Unable to complete assignment' }, { status: 500 });
    }

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    console.error('Complete assignment failed', err);
    return NextResponse.json({ error: 'Unable to complete assignment' }, { status: 500 });
  }
}
