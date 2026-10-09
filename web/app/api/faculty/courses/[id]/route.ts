import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  courseFailure,
  labelRequirements,
  loadOfferingSkills,
  loadGrading,
  loadOfferingRosters,
  loadOwnOffering,
  loadRequirements,
  must,
  notFound,
  requireRole,
} from '@/app/lib/courses';
import { termStatus } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: one of the instructor's course assignments — the course, term and
 * sections, the checklist with its labels, the instructor's own skills (and
 * which of them the AI picked), and the grading split (067; grading_ready is
 * false until it is applied).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');

    const [requirements, skills, rosters, sectionRows, grading] = await Promise.all([
      loadRequirements(supabase, [id]),
      loadOfferingSkills(supabase, [offering]),
      loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
      offering.section_ids.length
        ? supabase.from('sections').select('id, name').in('id', offering.section_ids).then(must)
        : Promise.resolve([] as { id: string; name: string }[]),
      loadGrading(supabase, id),
    ]);
    const roster = rosters.get(id);
    const without = new Set(roster?.sectionsWithoutGroup ?? []);
    const status = termStatus(offering.term);

    return NextResponse.json({
      offering: {
        id,
        course: offering.course,
        term: offering.term,
        status,
        locked: status === 'ended',
        sections: ((sectionRows ?? []) as { id: string; name: string }[])
          .map((s) => ({ id: s.id, name: s.name, has_group: !without.has(s.id) }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        student_count: roster?.students.length ?? 0,
      },
      requirements: await labelRequirements(supabase, requirements),
      skill_ids: skills.get(id)?.skill_ids ?? [],
      ai_skill_ids: skills.get(id)?.ai_skill_ids ?? [],
      grading: grading.grading,
      grading_ready: grading.ready,
      grading_auto: !!grading.grading?.auto,
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load the course');
  }
}
