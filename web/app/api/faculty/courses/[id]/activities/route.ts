import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOfferingRosters, loadOwnOffering, must, notFound, requireRole } from '@/app/lib/courses';
import { termBounds } from '@/app/lib/course-progress';
import { getFacultyStudentIdSet, scenarioVisibleToFaculty } from '@/app/lib/scenario-visibility';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: what a checklist item can link to — the Patient Cases the instructor
 * can see, published Quizzes, and Case Presentations they made or aimed at
 * the course's sections.
 *
 * A student does a Patient Case once (one assignment per student and case),
 * so for each case it also counts the course's students who finished it
 * before the term began: for them a "do this case" item can never be met.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');

    const [scenarioRows, quizRows, presentationRows, mine, rosters] = await Promise.all([
      supabase
        .from('scenarios')
        .select('id, title, scenario_assignments(student_id)')
        .order('created_at', { ascending: false })
        .limit(500)
        .then(must),
      supabase
        .from('assessments')
        .select('id, title')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(500)
        .then(must),
      supabase
        .from('case_presentations')
        .select('id, title, created_by, section_ids')
        .order('created_at', { ascending: false })
        .limit(500)
        .then(must),
      getFacultyStudentIdSet(supabase, session.uid),
      loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
    ]);

    const scenarios = ((scenarioRows ?? []) as unknown as { id: string; title: string; scenario_assignments: { student_id: string }[] }[])
      .filter((s) => scenarioVisibleToFaculty((s.scenario_assignments ?? []).map((a) => a.student_id), mine));

    const rosterIds = (rosters.get(id)?.students ?? []).map((s) => s.id);
    const before = new Map<string, number>();
    if (rosterIds.length && scenarios.length) {
      const done = (must(
        await supabase
          .from('scenario_assignments')
          .select('scenario_id')
          .in('student_id', rosterIds)
          .eq('status', 'completed')
          .lt('completed_at', termBounds(offering.term).from),
      ) ?? []) as { scenario_id: string }[];
      for (const row of done) before.set(row.scenario_id, (before.get(row.scenario_id) ?? 0) + 1);
    }

    const sections = new Set(offering.section_ids);
    const presentations = ((presentationRows ?? []) as { id: string; title: string; created_by: string | null; section_ids: string[] | null }[])
      .filter((p) => p.created_by === session.uid || (p.section_ids ?? []).some((s) => sections.has(s)))
      .map((p) => ({ id: p.id, title: p.title }));

    return NextResponse.json({
      scenarios: scenarios.map((s) => ({ id: s.id, title: s.title, completed_before_term: before.get(s.id) ?? 0 })),
      quizzes: (quizRows ?? []) as { id: string; title: string }[],
      presentations,
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load activities');
  }
}
