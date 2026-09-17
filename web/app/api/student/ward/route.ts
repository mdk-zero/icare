import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * GET /api/student/ward
 *
 * The mobile Clinic tab in one round trip: the admin's floor plan (rooms with
 * their placement from migration 035), who is in every bed, and the student's
 * own scenario assignments with a task-completion count.
 *
 * Students cannot read /api/admin/rooms (faculty+admin) and /api/patients does
 * not carry room_id or status, hence a purpose-built read. Like the faculty
 * chart route, a failed section degrades to an empty list rather than failing
 * the whole screen.
 *
 * Scope: every admitted patient is listed so the ward reads spatially, but a
 * patient who is not part of a scenario assigned to this student carries name
 * and bed only — no diagnosis, no vitals. Charting stays gated server-side by
 * isPatientAssigned in /api/student/vitals and /api/student/ehr.
 */

interface ScenarioRow {
  id: string;
  title: string;
  patient_id: string | null;
  description: string | null;
  difficulty: string | null;
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

    // 1. This student's assignments, and the scenarios behind them. Same chain
    //    as getAssignedPatientIds, read here in full so the banner can show the
    //    scenario brief without a second request.
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('scenario_assignments')
      .select('id, scenario_id, assigned_at, deadline, status, required, score, submitted_at, completed_at')
      .eq('student_id', session.uid)
      .order('assigned_at', { ascending: false });

    if (assignmentsError) {
      console.error('Failed to fetch ward assignments', assignmentsError);
      return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
    }

    const assignments = assignmentRows ?? [];
    const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id))];

    let scenariosById = new Map<string, ScenarioRow>();
    if (scenarioIds.length > 0) {
      const { data: scenarios } = await supabase
        .from('scenarios')
        .select('id, title, patient_id, description, difficulty, category, learning_objectives')
        .in('id', scenarioIds);
      scenariosById = new Map((scenarios ?? []).map((s) => [s.id, s as ScenarioRow]));
    }

    const assignedPatientIds = new Set<string>();
    for (const assignment of assignments) {
      const patientId = scenariosById.get(assignment.scenario_id)?.patient_id;
      if (patientId) assignedPatientIds.add(patientId);
    }
    const assignedIdList = [...assignedPatientIds];

    // 2. The ward itself plus the per-assignment task state and the assigned
    //    patients' latest vitals.
    const [roomsRes, patientsRes, tasksRes, completionsRes, vitalsRes] = await Promise.all([
      supabase.from('rooms').select('*').order('room_number'),
      supabase
        .from('patients')
        .select('id, name, age, gender, diagnosis, room_id, room_number, status')
        .eq('status', 'admitted')
        .limit(500),
      scenarioIds.length > 0
        ? supabase
            .from('scenario_tasks')
            .select('id, scenario_id, points')
            .in('scenario_id', scenarioIds)
        : Promise.resolve({ data: [], error: null }),
      assignments.length > 0
        ? supabase
            .from('scenario_task_completions')
            .select('assignment_id, task_id')
            .in(
              'assignment_id',
              assignments.map((a) => a.id),
            )
        : Promise.resolve({ data: [], error: null }),
      assignedIdList.length > 0
        ? supabase
            .from('vital_sign_readings')
            .select(
              'patient_id, recorded_at, heart_rate, bp_systolic, bp_diastolic, temperature_c, respiratory_rate, oxygen_saturation, is_anomaly, anomaly_reasons',
            )
            .in('patient_id', assignedIdList)
            .order('recorded_at', { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (roomsRes.error) {
      console.error('Failed to fetch ward rooms', roomsRes.error);
      return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
    }
    if (patientsRes.error) {
      console.error('Failed to fetch ward patients', patientsRes.error);
      return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
    }

    const patientRows = patientsRes.data ?? [];

    // Newest reading per patient — the list is already newest-first.
    const latestVitals = new Map<string, Record<string, unknown>>();
    for (const reading of vitalsRes.data ?? []) {
      if (!latestVitals.has(reading.patient_id)) latestVitals.set(reading.patient_id, reading);
    }

    const patients = patientRows.map((patient) => {
      const isAssigned = assignedPatientIds.has(patient.id);
      return {
        id: patient.id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        room_id: patient.room_id,
        room_number: patient.room_number,
        is_assigned: isAssigned,
        ...(isAssigned
          ? {
              diagnosis: patient.diagnosis,
              latest_vitals: latestVitals.get(patient.id) ?? null,
            }
          : {}),
      };
    });

    // A room's occupancy is its admitted patients, the same count capacity
    // gates in app/lib/patient-rooms.ts.
    const occupancy = new Map<string, number>();
    const roomsWithAssignment = new Set<string>();
    for (const patient of patientRows) {
      if (!patient.room_id) continue;
      occupancy.set(patient.room_id, (occupancy.get(patient.room_id) ?? 0) + 1);
      if (assignedPatientIds.has(patient.id)) roomsWithAssignment.add(patient.room_id);
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
      occupied: occupancy.get(room.id) ?? 0,
      has_assignment: roomsWithAssignment.has(room.id),
    }));

    const tasksByScenario = new Map<string, number>();
    for (const task of tasksRes.data ?? []) {
      tasksByScenario.set(task.scenario_id, (tasksByScenario.get(task.scenario_id) ?? 0) + 1);
    }
    const doneByAssignment = new Map<string, number>();
    for (const completion of completionsRes.data ?? []) {
      doneByAssignment.set(
        completion.assignment_id,
        (doneByAssignment.get(completion.assignment_id) ?? 0) + 1,
      );
    }

    const formattedAssignments = assignments.map((assignment) => {
      const scenario = scenariosById.get(assignment.scenario_id);
      return {
        id: assignment.id,
        scenario_id: assignment.scenario_id,
        scenario_title: scenario?.title ?? 'Unknown Scenario',
        description: scenario?.description ?? null,
        difficulty: scenario?.difficulty ?? null,
        category: scenario?.category ?? null,
        learning_objectives: scenario?.learning_objectives ?? null,
        patient_id: scenario?.patient_id ?? null,
        assigned_at: assignment.assigned_at,
        deadline: assignment.deadline,
        status: assignment.status,
        required: assignment.required,
        score: assignment.score,
        submitted_at: assignment.submitted_at,
        completed_at: assignment.completed_at,
        tasks_done: doneByAssignment.get(assignment.id) ?? 0,
        tasks_total: tasksByScenario.get(assignment.scenario_id) ?? 0,
      };
    });

    return NextResponse.json({ rooms, patients, assignments: formattedAssignments });
  } catch (err) {
    console.error('Fetch ward failed', err);
    return NextResponse.json({ error: 'Unable to load the ward' }, { status: 500 });
  }
}
