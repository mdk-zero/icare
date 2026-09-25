import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { isMissingTeamTables } from '@/app/lib/teams';

type Status = 'submitted' | 'in_progress' | 'not_started';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
  sections: { name: string } | null;
}

/**
 * Per-student results for one assessment.
 *
 * Faculty see only students in the sections they handle; admin sees everyone.
 * Students who have not opened the assessment are included as 'not_started' --
 * a results page that lists only the people who took it hides the ones a
 * faculty member most needs to chase.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, title, total_questions, max_attempts, target_sections, is_published')
      .eq('id', id)
      .maybeSingle();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Faculty are scoped to their own sections; admin is unscoped, which is
    // expressed as "no id filter" rather than a list of every student.
    const scopedIds =
      session.role === 'faculty' ? await getFacultyStudentIds(supabase, session.uid) : null;

    if (scopedIds !== null && scopedIds.length === 0) {
      return NextResponse.json({
        assessment,
        results: [],
        audience: 'assigned' as const,
        summary: { total: 0, submitted: 0, in_progress: 0, not_started: 0, average_score: null },
        groups: [],
      });
    }

    let studentQuery = supabase
      .from('users')
      .select('id, name, email, picture_url, sex, sections(name)')
      .eq('role', 'student')
      .order('name');
    if (scopedIds) studentQuery = studentQuery.in('id', scopedIds);

    const [studentsRes, attemptsRes, assignmentsRes] = await Promise.all([
      studentQuery,
      supabase
        .from('assessment_attempts')
        .select('student_id, status, score, submitted_at, time_taken_seconds, started_at')
        .eq('assessment_id', id),
      supabase.from('assessment_assignments').select('student_id').eq('assessment_id', id),
    ]);

    if (studentsRes.error) {
      console.error('Failed to list students for results', studentsRes.error);
      return NextResponse.json({ error: 'Unable to load results' }, { status: 500 });
    }
    if (attemptsRes.error) {
      console.error('Failed to load attempts', attemptsRes.error);
      return NextResponse.json({ error: 'Unable to load results' }, { status: 500 });
    }
    // Assignments decide the audience below, so a failed read must not quietly
    // widen it to the whole cohort.
    if (assignmentsRes.error) {
      console.error('Failed to load assignments', assignmentsRes.error);
      return NextResponse.json({ error: 'Unable to load results' }, { status: 500 });
    }

    const attemptsByStudent = new Map<string, typeof attemptsRes.data>();
    for (const attempt of attemptsRes.data ?? []) {
      const list = attemptsByStudent.get(attempt.student_id) ?? [];
      list.push(attempt);
      attemptsByStudent.set(attempt.student_id, list);
    }

    const assignedIds = new Set((assignmentsRes.data ?? []).map((a) => a.student_id));
    const targetSections = (assessment.target_sections ?? []) as string[];

    const students = (studentsRes.data ?? []) as unknown as StudentRow[];

    // Who this assessment is actually for.
    //
    // An explicit assignment is the strongest statement of audience there is:
    // once anyone has been assigned, the audience is the assigned students, and
    // the rest of the cohort is not "not started" -- they were never given it.
    //
    // target_sections is visibility, not assignment. Assigning to one section
    // leaves an untargeted assessment visible to every section (see the assign
    // route), so treating "no target sections" as "everyone is expected to take
    // it" reported whole rosters as not started for a quiz assigned to someone
    // else's section entirely. Visibility decides the audience only when nobody
    // has been assigned, where the assessment really is open to whoever sees it.
    //
    // An attempt always counts, whatever the targeting says -- anyone who has a
    // result must appear.
    const hasAssignments = assignedIds.size > 0;
    const inScope = (student: StudentRow) => {
      if (assignedIds.has(student.id) || attemptsByStudent.has(student.id)) return true;
      if (hasAssignments) return false;
      if (targetSections.length === 0) return true;
      return student.sections?.name ? targetSections.includes(student.sections.name) : false;
    };

    // Each student's group. Grades stay individual; the group is a label for
    // filtering and for the per-group averages below.
    const inScopeStudents = students.filter(inScope);
    const teamOf = new Map<string, { id: string; label: string }>();
    if (inScopeStudents.length > 0) {
      const { data: memberships, error: membershipError } = await supabase
        .from('team_members')
        .select('student_id, team_id, teams(name, sections(name))')
        .in('student_id', inScopeStudents.map((s) => s.id));
      if (membershipError && !isMissingTeamTables(membershipError)) {
        console.error('Failed to load groups for results', membershipError);
      }
      for (const m of memberships ?? []) {
        const team = m.teams as unknown as { name: string; sections: { name: string } | null } | null;
        if (!team) continue;
        teamOf.set(m.student_id as string, {
          id: m.team_id as string,
          label: team.sections?.name ? `${team.sections.name} · ${team.name}` : team.name,
        });
      }
    }

    const results = inScopeStudents.map((student) => {
      const attempts = attemptsByStudent.get(student.id) ?? [];
      const submitted = attempts.filter((a) => a.status === 'submitted');

      // Newest submission first, so "latest" is the most recent graded run.
      submitted.sort(
        (a, b) =>
          new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime(),
      );
      const latest = submitted[0] ?? null;

      const scores = submitted.map((a) => a.score).filter((s): s is number => s !== null);

      let status: Status = 'not_started';
      if (submitted.length > 0) status = 'submitted';
      else if (attempts.some((a) => a.status === 'in_progress')) status = 'in_progress';

      return {
        student_id: student.id,
        name: student.name,
        email: student.email,
        picture_url: student.picture_url,
        sex: student.sex ?? null,
        section: student.sections?.name ?? null,
        team_id: teamOf.get(student.id)?.id ?? null,
        team_label: teamOf.get(student.id)?.label ?? null,
        status,
        attempt_count: attempts.length,
        submitted_count: submitted.length,
        best_score: scores.length > 0 ? Math.max(...scores) : null,
        latest_score: latest?.score ?? null,
        latest_submitted_at: latest?.submitted_at ?? null,
        latest_time_taken_seconds: latest?.time_taken_seconds ?? null,
      };
    });

    const graded = results.map((r) => r.best_score).filter((s): s is number => s !== null);

    const average = (scores: number[]) =>
      scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
    const byGroup = new Map<string, { team_id: string; label: string; rows: typeof results }>();
    for (const r of results) {
      if (!r.team_id) continue;
      const entry = byGroup.get(r.team_id) ?? { team_id: r.team_id, label: r.team_label ?? 'Group', rows: [] };
      entry.rows.push(r);
      byGroup.set(r.team_id, entry);
    }
    const groups = [...byGroup.values()]
      .map((g) => ({
        team_id: g.team_id,
        label: g.label,
        members: g.rows.length,
        submitted: g.rows.filter((r) => r.status === 'submitted').length,
        average_score: average(g.rows.map((r) => r.best_score).filter((s): s is number => s !== null)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    return NextResponse.json({
      assessment,
      results,
      // Lets the page say whether an empty table means "assigned to nobody you
      // handle" or "nobody can see this yet".
      audience: hasAssignments ? 'assigned' : 'visibility',
      summary: {
        total: results.length,
        submitted: results.filter((r) => r.status === 'submitted').length,
        in_progress: results.filter((r) => r.status === 'in_progress').length,
        not_started: results.filter((r) => r.status === 'not_started').length,
        // Averaged over best scores, matching what the table ranks on.
        average_score:
          graded.length > 0
            ? Math.round(graded.reduce((sum, s) => sum + s, 0) / graded.length)
            : null,
      },
      groups,
    });
  } catch (err) {
    console.error('Fetch assessment results failed', err);
    return NextResponse.json({ error: 'Unable to load results' }, { status: 500 });
  }
}
