import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .select()
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch scenario', error);
      return NextResponse.json({ error: 'Unable to fetch scenario' }, { status: 500 });
    }

    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // Faculty and admin can read any scenario.
    if (session.role === 'faculty' || session.role === 'admin') {
      return NextResponse.json({ scenario });
    }

    // Students can only read scenarios they have been assigned.
    if (session.role === 'student') {
      const { data: assignment, error: assignmentError } = await supabase
        .from('scenario_assignments')
        .select('id')
        .eq('scenario_id', id)
        .eq('student_id', session.uid)
        .maybeSingle();

      if (assignmentError) {
        console.error('Failed to verify assignment', assignmentError);
        return NextResponse.json({ error: 'Unable to fetch scenario' }, { status: 500 });
      }

      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Fetch scenario failed', err);
    return NextResponse.json({ error: 'Unable to fetch scenario' }, { status: 500 });
  }
}
