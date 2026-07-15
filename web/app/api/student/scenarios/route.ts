import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: assignments, error } = await supabase
      .from('scenario_assignments')
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken')
      .eq('student_id', session.uid)
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch student assignments', error);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id))];
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, difficulty, category, patient_id')
      .in('id', scenarioIds);

    if (scenariosError) {
      console.error('Failed to fetch scenarios', scenariosError);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    const scenariosById = new Map(scenarios?.map((s) => [s.id, s]));

    const formatted = assignments.map((a) => {
      const scenario = scenariosById.get(a.scenario_id);
      return {
        id: a.id,
        scenario_id: a.scenario_id,
        scenario_title: scenario?.title ?? 'Unknown Scenario',
        patient_id: scenario?.patient_id ?? null,
        student_id: a.student_id,
        student_name: session.email,
        assigned_at: a.assigned_at,
        deadline: a.deadline,
        status: a.status,
        required: a.required,
        score: a.score,
        completed_at: a.completed_at,
        time_taken: a.time_taken,
      };
    });

    return NextResponse.json({ assignments: formatted });
  } catch (err) {
    console.error('Fetch student assignments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
  }
}
