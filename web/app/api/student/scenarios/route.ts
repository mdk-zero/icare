import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { kindOf, scenarioKinds } from '@/app/lib/scenario-kind';
import { loadAssignmentRooms, loadTimeLimits } from '@/app/lib/activity-room';

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

    // The student's team doesn't depend on the assignments, so it is read
    // alongside them; nothing before migration 048.
    const [{ data: assignments, error }, { data: membership }] = await Promise.all([
      supabase
        .from('scenario_assignments')
        // '*' so a database without started_at (before 063) still answers.
        .select('*')
        .eq('student_id', session.uid)
        .order('assigned_at', { ascending: false }),
      supabase.from('team_members').select('teams(name)').eq('student_id', session.uid).maybeSingle(),
    ]);

    if (error) {
      console.error('Failed to fetch student assignments', error);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id))];
    // Patient Case or Return Demonstration (072), so the app opens the right screen.
    // Its room and time limit (098), empty before it.
    const [{ data: scenarios, error: scenariosError }, kinds, timeLimits, rooms] = await Promise.all([
      supabase.from('scenarios').select('id, title, category, patient_id, patient_case').in('id', scenarioIds),
      scenarioKinds(supabase, scenarioIds),
      loadTimeLimits(supabase, scenarioIds),
      loadAssignmentRooms(supabase, assignments.map((a) => a.id as string)),
    ]);

    if (scenariosError) {
      console.error('Failed to fetch patient cases', scenariosError);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    const scenariosById = new Map(scenarios?.map((s) => [s.id, s]));
    const teamName = (membership?.teams as unknown as { name: string } | null)?.name ?? null;

    const formatted = assignments.map((a) => {
      const scenario = scenariosById.get(a.scenario_id);
      return {
        id: a.id,
        scenario_id: a.scenario_id,
        scenario_title: scenario?.title ?? 'Unknown Patient Case',
        patient_id: scenario?.patient_id ?? null,
        // The patient the instructor wrote into the case (098).
        patient_name:
          ((scenario?.patient_case as { patient?: { name?: string } } | null)?.patient?.name || null) ?? null,
        kind: kindOf(kinds, a.scenario_id),
        room: rooms.get(a.id) ?? null,
        time_limit_minutes: timeLimits.get(a.scenario_id) ?? null,
        student_id: a.student_id,
        student_name: session.email,
        team_name: teamName,
        assigned_at: a.assigned_at,
        deadline: a.deadline,
        status: a.status,
        required: a.required,
        score: a.score,
        completed_at: a.completed_at,
        time_taken: a.time_taken,
        // When the student pressed Start (null: not yet); absent before 063.
        ...('started_at' in a ? { started_at: a.started_at } : {}),
        // When the student handed it in (null: not yet). With status still
        // in_progress it is waiting for the Instructor's grade.
        ...('submitted_at' in a ? { submitted_at: a.submitted_at } : {}),
      };
    });

    return NextResponse.json({ assignments: formatted });
  } catch (err) {
    console.error('Fetch student assignments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
  }
}
