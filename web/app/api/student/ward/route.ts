import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { viewerDeanId } from '@/app/lib/dean-scope';
import { kindOf, scenarioKinds } from '@/app/lib/scenario-kind';
import { fetchTaskCompletions } from '@/app/lib/scenario-tasks';
import { isPerformed } from '@/app/lib/task-ratings';
import { loadTimeLimits } from '@/app/lib/activity-room';

/**
 * GET /api/student/ward
 *
 * The mobile Clinic tab in one round trip: the Dean's floor plan (rooms with
 * their placement from migration 035, doors and fixtures from 062) and the
 * student's own activities with a task-completion count.
 *
 * Wards are rooms only (098): a room is where the student performs a patient
 * case or Return Demonstration, set on each assignment. A room is marked when
 * the student has unfinished work in it, and `activities` lists everything
 * they have in a room. The patient census is no longer sent; `patients` stays
 * an empty list for app builds that still read it.
 *
 * Students cannot read /api/admin/rooms (faculty+admin), hence a purpose-built
 * read. A failed section degrades to an empty list rather than failing the
 * whole screen.
 */

interface ScenarioRow {
  id: string;
  title: string;
  patient_id: string | null;
  patient_case: { patient?: { name?: string } } | null;
  description: string | null;
  category: string | null;
  learning_objectives: unknown;
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 1. This student's assignments, both kinds, and the scenarios behind them.
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('scenario_assignments')
      // '*' so a database without started_at (063) or room_id (098) still answers.
      .select('*')
      .eq('student_id', session.uid)
      .order('assigned_at', { ascending: false });

    if (assignmentsError) {
      console.error('Failed to fetch ward assignments', assignmentsError);
      return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
    }

    const allRows = assignmentRows ?? [];
    const allScenarioIds = [...new Set(allRows.map((a) => a.scenario_id as string))];
    const kinds = await scenarioKinds(supabase, allScenarioIds);
    // The Clinic's lists are patient cases; Return Demonstrations have their own screen.
    const assignments = allRows.filter((a) => kindOf(kinds, a.scenario_id as string) === 'patient_case');
    const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id as string))];

    // 2. The ward (their Dean's, 077), the scenarios and the per-assignment task state.
    const deanId = await viewerDeanId(supabase, session);
    let roomsQuery = supabase.from('rooms').select('*').order('room_number');
    let fixturesQuery = supabase
      .from('ward_fixtures')
      .select('id, kind, label, plan_x, plan_y, plan_w, plan_h')
      .order('created_at');
    if (deanId) {
      roomsQuery = roomsQuery.eq('admin_id', deanId);
      fixturesQuery = fixturesQuery.eq('admin_id', deanId);
    }
    const [roomsRes, scenariosRes, tasksRes, completionsRes, fixturesRes, timeLimits] = await Promise.all([
      roomsQuery,
      allScenarioIds.length > 0
        ? supabase
            .from('scenarios')
            .select('id, title, patient_id, patient_case, description, category, learning_objectives')
            .in('id', allScenarioIds)
        : Promise.resolve({ data: [], error: null }),
      scenarioIds.length > 0
        ? supabase.from('scenario_tasks').select('id, scenario_id, points').in('scenario_id', scenarioIds)
        : Promise.resolve({ data: [], error: null }),
      fetchTaskCompletions(
        supabase,
        assignments.map((a) => a.id as string),
      ).then(({ rows, error }) => ({ data: rows, error })),
      fixturesQuery,
      loadTimeLimits(supabase, allScenarioIds),
    ]);
    // Missing before 062; any other failure only costs the plan its fixtures.
    if (fixturesRes.error && !['42P01', 'PGRST205'].includes(fixturesRes.error.code ?? '')) {
      console.error('Failed to fetch ward fixtures', fixturesRes.error);
    }
    if (roomsRes.error) {
      console.error('Failed to fetch ward rooms', roomsRes.error);
      return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
    }

    const scenariosById = new Map(((scenariosRes.data ?? []) as ScenarioRow[]).map((s) => [s.id, s]));
    const roomsById = new Map((roomsRes.data ?? []).map((r) => [r.id as string, r]));
    const roomOf = (a: Record<string, unknown>) => {
      const room = typeof a.room_id === 'string' ? roomsById.get(a.room_id) : undefined;
      return room ? { id: room.id as string, name: room.name as string, room_number: (room.room_number as string) ?? null } : null;
    };

    // A room is marked, and counts toward its plan, by the student's unfinished work in it.
    const openByRoom = new Map<string, number>();
    for (const a of allRows) {
      if (a.status === 'completed' || typeof a.room_id !== 'string') continue;
      openByRoom.set(a.room_id, (openByRoom.get(a.room_id) ?? 0) + 1);
    }

    const rooms = (roomsRes.data ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      room_number: room.room_number,
      capacity: room.capacity,
      status: room.status,
      plan_x: room.plan_x,
      plan_y: room.plan_y,
      plan_w: room.plan_w,
      plan_h: room.plan_h,
      plan_door: room.plan_door ?? null,
      occupied: openByRoom.get(room.id) ?? 0,
      has_assignment: openByRoom.has(room.id),
    }));

    const tasksByScenario = new Map<string, number>();
    for (const task of tasksRes.data ?? []) {
      tasksByScenario.set(task.scenario_id, (tasksByScenario.get(task.scenario_id) ?? 0) + 1);
    }
    const doneByAssignment = new Map<string, number>();
    // A task faculty rated "not performed" still has a row; it isn't done.
    for (const completion of (completionsRes.data ?? []).filter((c) => isPerformed(c))) {
      doneByAssignment.set(completion.assignment_id, (doneByAssignment.get(completion.assignment_id) ?? 0) + 1);
    }

    const patientName = (scenario: ScenarioRow | undefined) => scenario?.patient_case?.patient?.name || null;

    const formattedAssignments = assignments.map((assignment) => {
      const scenario = scenariosById.get(assignment.scenario_id);
      return {
        id: assignment.id,
        scenario_id: assignment.scenario_id,
        scenario_title: scenario?.title ?? 'Unknown Patient Case',
        description: scenario?.description ?? null,
        category: scenario?.category ?? null,
        learning_objectives: scenario?.learning_objectives ?? null,
        patient_id: scenario?.patient_id ?? null,
        // The patient written into the case, the room and the time limit (098).
        patient_name: patientName(scenario),
        room: roomOf(assignment),
        time_limit_minutes: timeLimits.get(assignment.scenario_id) ?? null,
        assigned_at: assignment.assigned_at,
        deadline: assignment.deadline,
        status: assignment.status,
        required: assignment.required,
        score: assignment.score,
        submitted_at: assignment.submitted_at,
        completed_at: assignment.completed_at,
        tasks_done: doneByAssignment.get(assignment.id) ?? 0,
        tasks_total: tasksByScenario.get(assignment.scenario_id) ?? 0,
        // When the student pressed Start (null: not yet); absent before 063.
        ...('started_at' in assignment ? { started_at: assignment.started_at } : {}),
      };
    });

    // Everything the student has in a room, both kinds, for the room's screen.
    const activities = allRows
      .filter((a) => typeof a.room_id === 'string')
      .map((a) => ({
        id: a.id,
        room_id: a.room_id as string,
        kind: kindOf(kinds, a.scenario_id as string),
        scenario_title: scenariosById.get(a.scenario_id)?.title ?? 'Untitled',
        patient_name: patientName(scenariosById.get(a.scenario_id)),
        deadline: a.deadline,
        status: a.status,
        time_limit_minutes: timeLimits.get(a.scenario_id) ?? null,
        ...('started_at' in a ? { started_at: a.started_at } : {}),
      }));

    return NextResponse.json({
      rooms,
      fixtures: fixturesRes.error ? [] : (fixturesRes.data ?? []),
      patients: [],
      assignments: formattedAssignments,
      activities,
    });
  } catch (err) {
    console.error('Fetch ward failed', err);
    return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
  }
}
