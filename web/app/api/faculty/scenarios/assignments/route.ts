import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent, getAdminScope } from '@/app/lib/admin-scope';
import { getFacultyStudentIds } from '@/app/lib/roster';
import {
  fetchPerformedTaskCounts,
  fetchTaskCountsByScenario,
} from '@/app/lib/scenario-tasks';

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
        if (!(await canSeeStudent(supabase, session, requestedStudentId))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        studentIds = [requestedStudentId];
      } else {
        // Only this admin's students (migration 053).
        const scope = await getAdminScope(supabase, session.uid);
        let allQuery = supabase.from('users').select('id').eq('role', 'student').limit(2000);
        if (scope) allQuery = allQuery.in('id', scope.studentIds.length ? scope.studentIds : ['00000000-0000-0000-0000-000000000000']);
        const { data: allStudents, error: studentsError } = await allQuery;

        if (studentsError) {
          console.error('Failed to fetch students', studentsError);
          return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
        }

        studentIds = allStudents?.map((s) => s.id) ?? [];
      }
    } else {
      studentIds = await getFacultyStudentIds(supabase, session.uid);

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
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken, submitted_at, finalized_by, team_id')
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
    // Task progress is read here rather than left to the caller, so a list row
    // can say how much of the checklist was actually performed instead of
    // guessing at a fixed checklist length.
    const [scenariosRes, studentsRes, taskCounts, performedCounts, teamsRes] = await Promise.all([
      supabase.from('scenarios').select('id, title').in('id', scenarioIds),
      supabase.from('users').select('id, name, picture_url, sex').in('id', studentIds),
      fetchTaskCountsByScenario(supabase, scenarioIds),
      fetchPerformedTaskCounts(
        supabase,
        assignments.map((a) => a.id as string),
      ),
      // Each student's team, for grouping; nothing before migration 048.
      supabase.from('team_members').select('student_id, team_id, teams(name, sections(name))').in('student_id', studentIds),
    ]);

    if (scenariosRes.error || studentsRes.error) {
      console.error('Failed to fetch related data', scenariosRes.error, studentsRes.error);
      return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
    }
    // Task progress is supporting detail; if it can't be read the assignments
    // themselves are still worth returning, with the counts left unknown.
    if (taskCounts.error || performedCounts.error) {
      console.error('Failed to fetch task progress', taskCounts.error, performedCounts.error);
    }

    const scenariosById = new Map(scenariosRes.data?.map((s) => [s.id, s.title]));
    const studentsById = new Map(studentsRes.data?.map((s) => [s.id, s]));
    const countsKnown = !taskCounts.error && !performedCounts.error;
    // Group names repeat across sections ("Group 1"), so the label carries the
    // section and the id is what callers group and filter by.
    const teamByStudent = new Map(
      (teamsRes.error ? [] : teamsRes.data ?? []).map((m) => {
        const team = m.teams as unknown as { name: string; sections: { name: string } | null } | null;
        return [
          m.student_id as string,
          {
            id: m.team_id as string,
            name: team?.name ?? null,
            label: team ? (team.sections?.name ? `${team.sections.name} · ${team.name}` : team.name) : null,
          },
        ];
      }),
    );

    const formatted = assignments.map((a) => ({
      id: a.id,
      scenario_id: a.scenario_id,
      scenario_title: scenariosById.get(a.scenario_id) ?? 'Unknown Scenario',
      student_id: a.student_id,
      student_name: studentsById.get(a.student_id)?.name ?? 'Unknown Student',
      student_picture_url: studentsById.get(a.student_id)?.picture_url ?? null,
      student_sex: studentsById.get(a.student_id)?.sex ?? null,
      team_id: teamByStudent.get(a.student_id)?.id ?? null,
      team_name: teamByStudent.get(a.student_id)?.name ?? null,
      team_label: teamByStudent.get(a.student_id)?.label ?? null,
      /** The group this assignment was given through, which may differ after regrouping. */
      assigned_team_id: a.team_id ?? null,
      assigned_at: a.assigned_at,
      deadline: a.deadline,
      status: a.status,
      required: a.required,
      score: a.score,
      completed_at: a.completed_at,
      time_taken: a.time_taken,
      submitted_at: a.submitted_at,
      finalized_by: a.finalized_by,
      total_tasks: countsKnown ? taskCounts.counts.get(a.scenario_id) ?? 0 : null,
      completed_tasks: countsKnown ? performedCounts.counts.get(a.id) ?? 0 : null,
    }));

    return NextResponse.json({ assignments: formatted });
  } catch (err) {
    console.error('Fetch faculty assignments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assignments' }, { status: 500 });
  }
}
