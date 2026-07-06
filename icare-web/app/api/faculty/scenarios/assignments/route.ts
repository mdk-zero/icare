import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const requestedStudentId = searchParams.get('student_id');

    let studentIds: string[] = [];

    if (session.role === 'admin') {
      if (requestedStudentId) {
        studentIds = [requestedStudentId];
      } else {
        const { data: allStudents, error: studentsError } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'student')
          .limit(2000);

        if (studentsError) {
          console.error('Failed to fetch students', studentsError);
          return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
        }

        studentIds = allStudents?.map((s) => s.id) ?? [];
      }
    } else {
      const { data: roster, error: rosterError } = await supabase
        .from('faculty_students')
        .select('student_id')
        .eq('faculty_id', session.uid);

      if (rosterError) {
        console.error('Failed to fetch faculty roster', rosterError);
        return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
      }

      studentIds = roster?.map((r) => r.student_id) ?? [];

      if (requestedStudentId) {
        if (!studentIds.includes(requestedStudentId)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        studentIds = [requestedStudentId];
      }
    }

    if (studentIds.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from('scenario_assignments')
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken')
      .in('student_id', studentIds)
      .order('assigned_at', { ascending: false })
      .limit(2000);

    if (assignmentsError) {
      console.error('Failed to fetch assignments', assignmentsError);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id))];
    const [scenariosRes, studentsRes] = await Promise.all([
      supabase.from('scenarios').select('id, title').in('id', scenarioIds),
      supabase.from('users').select('id, name').in('id', studentIds),
    ]);

    if (scenariosRes.error || studentsRes.error) {
      console.error('Failed to fetch related data', scenariosRes.error, studentsRes.error);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }

    const scenariosById = new Map(scenariosRes.data?.map((s) => [s.id, s.title]));
    const studentsById = new Map(studentsRes.data?.map((s) => [s.id, s.name]));

    const formatted = assignments.map((a) => ({
      id: a.id,
      scenario_id: a.scenario_id,
      scenario_title: scenariosById.get(a.scenario_id) ?? 'Unknown Scenario',
      student_id: a.student_id,
      student_name: studentsById.get(a.student_id) ?? 'Unknown Student',
      assigned_at: a.assigned_at,
      deadline: a.deadline,
      status: a.status,
      required: a.required,
      score: a.score,
      completed_at: a.completed_at,
      time_taken: a.time_taken,
    }));

    return NextResponse.json({ assignments: formatted });
  } catch (err) {
    console.error('Fetch faculty assignments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
  }
}
